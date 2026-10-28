---
title: Unique IDs
description: How a system gives every record an ID that no other record has, from a database sequence to blocks of numbers, random and time-ordered IDs, IDs that people see, and short codes.
---

Every record that other records point to needs an ID that no other record has, and the way the ID is made decides what it costs, what it reveals, and how it breaks as the system grows. Pick the generator by what the ID must do: where it must be unique, whether it must follow time, what it may reveal, and how its generator may fail.

## Numbering records in one database

A marketplace lets many sellers sell goods to buyers. It starts on one PostgreSQL server with tables for sellers, products, orders, and payments. Every new order needs an ID before anything can point to it: the order's items, its payment, and its shipment all store that ID.

The simplest generator is a counter inside the database. A **sequence** is a database object that returns the next number on every call. An identity column takes its default value from a sequence; MySQL calls the same thing `AUTO_INCREMENT`.

```sql
CREATE TABLE orders (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  seller_id  bigint NOT NULL,
  buyer_id   bigint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO orders (seller_id, buyer_id)
VALUES (7, 1001)
RETURNING id;
-- 1043
```

The ID takes 8 bytes, newer records get larger numbers, and nothing outside the database takes part. Use `bigint`: an `int` key [runs out at about 2.1 billion](../../technologies/postgresql/#keeping-data-valid-inside-the-database). The app learns the ID only after the insert, from `RETURNING`. `GENERATED ALWAYS` rejects an ID that the app sends itself: an ID written by hand does not move the sequence, so the sequence would later return the same number and the insert would fail on the primary key.

A sequence is fast because it works outside transactions. It hands a number to a transaction and forgets it, so concurrent inserts never wait for each other to commit. The price is that a number, once given out, is gone. A rolled-back transaction, an insert that fails on a constraint, and an insert that ends in `ON CONFLICT DO NOTHING` all use up a number, and the table gets a gap. PostgreSQL also writes the sequence's position to its log 32 numbers ahead of time, so after a crash the sequence jumps forward by up to 32 ([Albe](https://www.cybertec-postgresql.com/en/gaps-in-sequences-postgresql/)). Gaps are normal, and the last ID does not tell how many records exist. Numbers that must have no gaps need [another tool](#numbers-without-gaps).

::diagram{name="sequence-gaps"}

Every call goes to one shared counter. To touch it less often, a sequence can hand each connection a batch of numbers at once, and the connection then serves the next numbers from memory (`CACHE` in PostgreSQL). This has two costs. Numbers from different connections interleave: connection A takes 1 to 20, connection B takes 21 to 40, and B's record 21 is written before A's record 2. And a connection that closes loses the unused rest of its batch. The batch size trades order for speed. PostgreSQL's default is 1. Aurora DSQL, a distributed database that speaks PostgreSQL, makes you choose between 1, for numbers that follow their order closely, and at least 65,536, for many connections that insert at a high rate ([AWS docs](https://docs.aws.amazon.com/aurora-dsql/latest/userguide/sequences-identity-columns-working-with.html)).

::diagram{name="sequence-batches"}

A sequence promises one thing: no two committed transactions get the same number, as long as nobody resets it by hand. It does not promise numbers without gaps, and it does not promise that records commit in the order of their numbers.

:::do
In one database, give records a `bigint` identity column and let the database number them. Accept gaps, and never read a count or a meaning from the number. Raise the sequence's `CACHE` only when the shared counter limits the insert rate and the order of numbers across connections does not matter.
:::

The numbers grow, but records do not appear to readers in that order.

## Reading new records in ID order

An order is written once its payment succeeds, and the warehouse service ships every new order. Every few seconds it asks the database for the orders it has not seen yet, those with an ID above the last one it handled, and remembers the largest ID it got:

```sql
SELECT id, seller_id, buyer_id
FROM orders
WHERE id > 1043
ORDER BY id
LIMIT 100;
```

Two orders are created at the same moment. Transaction A takes ID 1044 and then spends 200 ms writing the order's items. Transaction B takes 1045 and commits at once. The warehouse reads between the two commits, gets 1045, and remembers it. Then A commits. The next read asks for IDs above 1045, so order 1044 is never shipped. Nothing fails and nothing logs an error.

::diagram{name="commit-order-skip"}

The ID is given when the insert runs, but the row becomes visible to others only at commit, and transactions take different times. So rows appear out of their ID order near the newest end of the table. A `created_at` column has the same problem: in PostgreSQL, `now()` returns the time when the transaction started, not when it committed ([Sequin](https://blog.sequinstream.com/postgres-sequences-can-commit-out-of-order/)). Any generator does this, because every generator gives the ID before the commit: a sequence, a timestamp, or an ID made in the app.

There are four ways to read every row:

- Stay behind the newest rows. Page by the time the database set when the writing transaction started, with `(created_at, id)` as the cursor, and read only rows older than a margin, such as `created_at < now() - interval '30 seconds'`. Cap every transaction below the margin with a timeout (`transaction_timeout` since PostgreSQL 17): then every transaction that wrote a row older than the margin has already ended, and nothing can appear behind the cursor. This holds only while the database sets the time, its clock does not jump, back or forward, by more than the slack in the margin, and no prepared (two-phase) transaction writes these rows, since the timeout does not cover those. A filter on time next to a cursor on the ID does not work, since a row with a smaller ID can still have a later time. New rows reach the reader one margin late.
- Read up to the oldest open transaction. Store the ID of the writing transaction in each row (in PostgreSQL, `xid8 DEFAULT pg_current_xact_id()`), page by `(transaction ID, id)`, and read only rows of transactions older than the oldest one still running (`pg_snapshot_xmin(pg_current_snapshot())`). New transactions get larger IDs, so nothing appears behind the cursor. But one long transaction anywhere in the database, even on another table, holds the reader back until it ends ([Sequin](https://blog.sequinstream.com/postgres-sequences-can-commit-out-of-order/)).
- Number rows at commit. As the last step before the commit, the transaction takes the next number from a **counter row**, a row that holds the last number given, and writes it into its own column of the new row. The update locks the counter row until the commit, so the next writer gets the next number only after the previous one committed, and numbers become visible in order. The reader pages by this column instead of the ID. The cost is that all writers that share the counter take turns at the end of their transactions. Sequin saw lock waits of seconds until it moved the update to the very end of each transaction. When readers need order only per seller or per account, keep one counter row per seller or account.
- Read the database's log. CDC reads committed changes in the order of their commits, and the reader keeps its position in the log rather than the last ID. It needs a log reader to run and watch, and it is how changes usually reach other systems. <!-- link: patterns/async-processing -->

::diagram{name="four-ways-to-read"}

::diagram{name="number-at-commit"}

:::avoid
Paging by "the largest ID or timestamp I have seen" through the newest rows while other transactions write. A row with a smaller ID can commit after the reader moved past it, and the reader never sees it.
:::

:::do
To move new rows to other systems, read the database's log. For a reader that polls a table, page by the start time of the writing transaction and stay behind the newest rows by more than the longest allowed transaction, with a timeout that covers every writer and a clock that does not jump. Number rows at commit through a counter row only when readers need the exact order and the writers that share the counter are few.
:::

## Numbers without gaps

Sellers on the marketplace issue invoices through it. EU VAT rules require each invoice to carry a sequential number in one or more series ([Directive 2006/112/EC, Article 226](https://eur-lex.europa.eu/eli/dir/2006/112/oj)), and the marketplace promises sellers more: one series per seller and year, 2026-1, 2026-2, 2026-3, with no number skipped. A sequence cannot give that, since a rollback loses its number.

A counter row can, because it changes inside the transaction. Keep one counter per series and take the next number in the transaction that writes the invoice:

```sql
CREATE TABLE invoice_counters (
  seller_id bigint,
  year      int,
  last_no   int NOT NULL,
  PRIMARY KEY (seller_id, year)
);

BEGIN;

WITH next AS (
  INSERT INTO invoice_counters (seller_id, year, last_no)
  VALUES (7, 2026, 1)
  ON CONFLICT (seller_id, year)
  DO UPDATE
  SET last_no = invoice_counters.last_no + 1
  RETURNING last_no
)
INSERT INTO invoices (seller_id, year, number, order_id)
SELECT 7, 2026, last_no, 1043
FROM next
RETURNING number;
-- 418

COMMIT;
```

The first invoice of a year creates the counter with 1; later ones raise it by one. The counter and the invoice change in one transaction: if it rolls back, the counter rolls back with it and the next invoice gets 418 again. A unique key on `(seller_id, year, number)` catches a bug that would write a number twice.

::diagram{name="gapless-vs-sequence"}

The update locks the counter row until the commit, so the invoices of one series get their numbers one at a time, while other sellers do not wait. The time the lock is held caps the rate: if the transaction holds it for 5 ms, one series gets at most about 200 numbers per second. So take the number as the last step before the commit, and do the slow work, such as rendering a PDF or sending an email, after it. The counter must live in the same database as the invoices: a number taken from another store cannot roll back with the invoice.

::diagram{name="series-lock"}

Two rules keep the series whole after the commit:

- Give the number when the document is issued, not when its draft is created. Drafts get thrown away, and each one would leave a gap.
- Never delete an issued document. Cancel it with another document, such as a credit note, that takes its own number.

When only the display needs consecutive numbers, store nothing: number the rows when you read them with `row_number() OVER (PARTITION BY seller_id ORDER BY created_at, id)` ([Albe](https://www.cybertec-postgresql.com/en/gaps-in-sequences-postgresql/)). These numbers change when an earlier row is deleted, so they cannot go into a document that has already been sent.

:::tradeoff
A counter row in the writing transaction gives numbers without gaps. In return, the writers of one series wait for each other, and the series cannot grow faster than one transaction at a time.
:::

:::do
Use a counter row per series only for numbers that rules or people require to be unbroken, such as invoices. Keep the series small (per seller, per year), take the number last, and keep the transaction short. Everything else uses an ID with gaps.
:::

## IDs that outsiders see

A buyer opens their order at `/orders/1043`. The number in the address causes two problems.

The first is guessing. The buyer changes 1043 to 1044 and sees someone else's order, if the server only looks the order up by ID. The bug is the missing access check: the server must check on every request that the current user may see that record ([OWASP](https://cheatsheetseries.owasp.org/cheatsheets/Insecure_Direct_Object_Reference_Prevention_Cheat_Sheet.html)). An ID that is hard to guess only adds a second line of defense. <!-- link: fundamentals/security -->

The second is counting. A competitor buys something on Monday and gets order 1043, buys again a week later and gets 9043, and now knows the marketplace sells about 8,000 orders a week. Numbers given in order show roughly how many records were created and how fast that number grows. During the Second World War, the Allies estimated German tank production from the serial numbers of captured tanks: for June 1940 the estimate was 169 tanks, intelligence reports said 1,000, and German records later showed 122 ([Wikipedia](https://en.wikipedia.org/wiki/German_tank_problem)).

The fix keeps two IDs. The `bigint` key stays inside: foreign keys and joins use it. A **public ID** goes outside: a random string, created by the app with a cryptographically secure random generator, stored in its own column with a unique constraint. If an insert hits the constraint, the app makes a new string and retries. PlanetScale (2022) uses 12 characters from `0-9a-z` and estimated a 1% chance of a single collision in about 35 years at 1,000 IDs an hour ([PlanetScale](https://planetscale.com/blog/why-we-chose-nanoids-for-planetscales-api)). The API looks the record up by the public ID and the access rule in one query:

```sql
SELECT id, status, total
FROM orders
WHERE public_id = 'izkpm55j334u'
  AND buyer_id = 1001;
```

::diagram{name="two-ids"}

A short prefix that names the type, such as `ord_izkpm55j334u`, helps people and code. A person sees at a glance what the ID points to, a mixed-up ID (a customer ID where an order ID belongs) fails at once, an API that accepts several types knows which table to query, and a scanner can find leaked secrets by their prefix. Stripe has used such prefixes since 2012 ([Asjes, 2022](https://dev.to/stripe/designing-apis-for-humans-object-ids-3o5a)).

Encoding the number does not hide it. Tools such as Sqids turn 1043 into a short string that looks random, but anyone who learns the alphabet can decode it back, and their authors say not to use them for data that must stay secret ([Sqids](https://sqids.org/faq)). Encrypting the number with a secret key does hide it, but the service must then keep every old key, and know which key made each ID, for as long as old IDs stay valid.

:::do
Check access on every request, whatever the ID looks like. Keep a compact key inside and give outsiders a random public ID with a unique constraint, prefixed with its type. Show the internal number only where the count is no secret, such as in internal tools.
:::

## Several databases handing out numbers

The marketplace outgrows one server and splits orders by seller across four databases (more on [splitting a table across nodes](../../fundamentals/sharding/#splitting-a-table-across-nodes)). Each database has its own sequence, so each one hands out order 1043. A payment that points to order 1043 no longer says which order it means, and a seller moved to another database brings IDs that are already taken there.

::diagram{name="shards-repeat-ids"}

The first fix keeps a sequence on each database but makes the sequences skip each other's numbers. Each database starts from its own offset and steps by the same amount:

```sql
CREATE SEQUENCE order_ids
  START WITH 3
  INCREMENT BY 16;
-- database 3 of up to 16: 3, 19, 35, 51, ...
```

MySQL does the same with `auto_increment_increment` and `auto_increment_offset`. Flickr ran two ID servers this way in 2010, one giving odd numbers and one even ([Flickr](https://code.flickr.net/2010/02/08/ticket-servers-distributed-unique-primary-keys-on-the-cheap/)). Nothing is shared at run time. But the step fixes the number of databases: a 17th one needs a new step for all of them, so pick a step with room to grow. And the counters drift apart: a busy database reaches 9 million while a quiet one is at 2 million, so across databases the numbers no longer follow time.

::diagram{name="step-offset"}

The second fix puts one counter in one place. A **ticket server** is a small database whose only job is to hand out the next number, and every insert in every database first asks it. Flickr's ticket server was a MySQL table with one row per counter: `REPLACE INTO` deleted and reinserted the row, and the new auto-increment value was the ticket. It kept separate counters for several kinds of records. Numbers again follow time, roughly. But every new record costs a network round trip, and when the ticket server is down, nothing can be created. Flickr ran two of them, with the odd and even numbers above, which brought back the loss of order.

The third fix takes numbers from the counter in blocks. Each app server asks the central counter for a **block of IDs**, such as 1,000 numbers at once, and hands them out from memory:

```sql
UPDATE id_blocks
SET next_id = next_id + 1000
WHERE name = 'orders'
RETURNING next_id - 1000 AS first_id;
-- 52001
```

This server now owns 52001 to 53000, and another server that asks next gets 53001 to 54000. The counter sees one request per 1,000 IDs, and an outage of the counter stops inserts only after the servers use up their blocks. Ask for the next block in the background while enough of the current one is left to cover the peak rate for the time a request to the counter can take, so no insert waits for it. Vitess, which shards MySQL, builds its sequences this way: a one-row table holds the next free value and the block size, the server that owns the table hands out IDs from memory, and it writes the table once per block ([Vitess](https://vitess.io/docs/reference/features/vitess-sequences/)). The costs are those of a sequence that hands out batches, on a larger scale: a server that restarts loses the rest of its block, and the IDs of different servers interleave, so a newer record can get a smaller ID.

::diagram{name="ticket-vs-blocks"}

The whole scheme rests on one rule: the counter must never give a block twice. So the counter commits each block before any of its IDs is used, and it lives in a store that does not lose a confirmed write when its primary fails. A unique key on each table does not help here: two databases that get the same block each accept the same ID. The counter can live in Redis, with `INCRBY orders 1000` taking a block, but Redis copies writes to its replicas after it confirms them, so a replica promoted after a failure may have missed the last blocks and hand them out again (more on [replacing a failed primary](../../technologies/redis/#replacing-a-failed-primary)). After such a failover, first make sure the old primary can no longer hand out blocks, since a primary cut off by the network may keep serving its side. Then move the counter past every block it could have given. If nobody knows how far that is, jump far enough ahead that no old block can reach, or start a new range.

::diagram{name="block-given-twice"}

:::tradeoff
Step and offset need nothing at run time but fix the number of databases. A ticket server gives one series but adds a round trip and a single point of failure to every insert. Blocks of IDs make the round trip rare and survive short outages of the counter, at the cost of gaps and an order that holds only within one block.
:::

:::do
For 64-bit numbers across databases, take blocks of IDs from one counter, with a block size that makes the requests rare. Commit each block before using it, in a store that keeps confirmed writes through a failover.
:::

## IDs made anywhere without asking

The mobile app creates a checkout before it hears back from the server: when the network drops, it must retry the same checkout and not create a second one. Services also create records that point to each other before any of them is written. Each of them needs an ID without a round trip to a counter.

A **UUID** is a 128-bit ID in a standard format, written as 36 characters of hex digits and dashes ([RFC 9562](https://www.rfc-editor.org/rfc/rfc9562)). **UUIDv4** fills 122 of the 128 bits with random bits, so any process can create one without asking anyone. Two random IDs clash only by chance: with N IDs, the chance that any two are equal is about N² / 2¹²³. So the chance of any clash reaches one in a billion only after about 103 trillion UUIDv4. The math holds only for good random bits: take them from the operating system's cryptographically secure generator. In practice, clashes come from bad randomness, such as virtual machines cloned with the same seed.

::diagram{name="uuidv4-bits"}

Because the client makes the ID, it can send the same ID with every retry. The server keeps a unique key on it, so a repeated create meets the existing row and returns it instead of making a second one (more on [retries that create duplicates](../../fundamentals/networking/#when-a-call-fails)). An ID from a client is still only a claim. A client can send an ID that it saw elsewhere, so on a conflict check that the existing row belongs to the same user and has the same content before you treat the request as a retry. The Bluesky network makes the same point about its own client-made IDs: it does not trust them to be unique, since anyone can reuse a known one ([AT Protocol](https://atproto.com/specs/tid)).

::diagram{name="client-id-conflict"}

Random keys have a cost in a B-tree index (more on [UUID keys in PostgreSQL](../../technologies/postgresql/#keeping-data-valid-inside-the-database)). A new random key lands on a random page of the index, so once the index is larger than memory, each insert may read a page from disk, and pages split more often and stay less full on average. Recent rows also spread over the whole index, so reading the last day's records touches many pages. In a database where every secondary index stores the primary key, as in MySQL, a 16-byte key also makes every other index larger. Store a UUID in the database's `uuid` type or as 16 bytes, not as 36 characters of text.

:::do
Use UUIDv4 when IDs must be created anywhere without asking and must reveal nothing. Keep a unique key on it, and check ownership when a client-made ID already exists. For the primary key of a table that takes many inserts into one B-tree, prefer an ID that grows over time.
:::

Random IDs carry no order, so the newest records cannot be found by their IDs.

## IDs ordered by creation time

Buyers see their orders newest first, and a chat between a buyer and a seller loads older messages page by page, by asking for messages with an ID below the oldest one it has. A list can page by `(created_at, id)` with any ID, but an ID that grows over time is the cursor by itself. Here it must also fit the `bigint` columns that other tables already use, and come from many servers without a central counter.

Put the time in the high bits. A **Snowflake ID**, named after the service Twitter built in 2010, is a 64-bit number made of three parts ([Twitter](https://github.com/twitter-archive/snowflake/tree/snowflake-2010)):

- 41 bits of milliseconds since a chosen start date, which lasts 69 years;
- 10 bits of node number, a number that sets each generator apart, so up to 1,024 generators run at once;
- 12 bits of sequence, so each generator makes up to 4,096 IDs in one millisecond.

::diagram{name="snowflake-bits"}

The top bit stays 0, so the ID is a positive `bigint`. Each generator keeps the last millisecond and the sequence in memory:

```python
EPOCH_MS = 1_735_689_600_000  # 2025-01-01

def next_id(self):
    with self.lock:  # one caller at a time
        now = current_millis()
        if now == self.last_ms:
            self.seq = (self.seq + 1) & 0xFFF  # 12 bits: after 4,095 comes 0
            if self.seq == 0:  # 4,096 IDs in this millisecond
                now = wait_until_after(self.last_ms)  # go on in the next one
        else:
            self.seq = 0
        self.last_ms = now
        return (now - EPOCH_MS) << 22 | self.node << 12 | self.seq
```

Two generators never make the same ID as long as their node numbers differ, and IDs from one generator grow as long as its clock does not go back, a case that needs its own check. IDs sort by time across generators too, but only as well as their clocks agree: an ID made 2 ms later on a node whose clock runs 5 ms behind sorts first. Twitter promised that IDs would be out of order by less than a second, and aimed for tens of milliseconds. A sort by ID is therefore close to the order of creation, not the order of cause and effect (more on [clocks that disagree](../../fundamentals/consistency/#clocks-that-disagree)), and a reader that pages through the newest IDs still needs the care from [reading new records in ID order](#reading-new-records-in-id-order).

The split of the 64 bits is a design choice. Choose the time unit and the lifetime first, then the number of generators, and give the rest to the sequence. Sonyflake uses 39 bits of 10 ms units, 174 years, a 16-bit node number, and an 8-bit sequence, so a generator makes only 256 IDs per 10 ms ([Sonyflake](https://github.com/sony/sonyflake)). Discord uses 42 bits of milliseconds since 2015, the top bit included, and splits the 10 node bits into a worker and a process ([Discord](https://discord.com/developers/docs/reference#snowflakes)). Many systems split them into a data center and a machine.

::diagram{name="bit-budgets"}

Two more things come with the time inside. Anyone can read from the ID when the record was created, and Discord documents how to do it. And a 64-bit number does not survive JavaScript: whole numbers there are exact only up to 2⁵³ − 1 ([MDN](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number/MAX_SAFE_INTEGER)), so a browser silently rounds such an ID. Send 64-bit IDs as strings in JSON, as Discord does.

::diagram{name="json-rounding"}

:::do
Use a Snowflake-style ID when IDs must grow over time, fit in 64 bits, and come from many servers without a counter. Choose the bit split for your lifetime, number of generators, and peak rate per generator, and send the IDs as strings in JSON.
:::

Every generator needs a node number that no other running generator has.

## Giving each generator its own number

The marketplace runs its order service on 40 servers that start and stop with the load, and each runs a generator. Two generators with the same node number make the same IDs whenever they work in the same millisecond, and nothing notices until a unique key fails or two orders share an ID. The **node number** (also called the worker ID or machine ID) must be unique among all generators that run at the same time, and every way to assign it has its own way to fail:

- A setting per server. Simple, until a copied config or an autoscaled server starts with a number that is already in use.
- A claim in a coordination service. At start, the generator claims a free number in ZooKeeper or etcd under a lease and renews it while it runs; Twitter's Snowflake took its number from ZooKeeper. A generator that cannot renew must stop making IDs before the lease ends, or another generator may take its number while it still runs. A process that pauses, for a long garbage collection or a frozen virtual machine, can wake up after its lease ended and keep going, so it checks before every batch of IDs that its lease still has time left, more than the longest pause it allows (more on [letting only one node act](../../fundamentals/consistency/#letting-only-one-node-act)). Where that cannot be promised, a new number at every start is safer.
- A new number at every start. The generator inserts a row into a table and uses the row's ID as its node number, and numbers are never reused. Baidu's UidGenerator does this with 22 bits, enough for about 4 million starts ([Baidu](https://github.com/baidu/uid-generator)). A restarted generator never shares a number with its old self, which also helps when its clock went back. The bits run out after many starts, so they must be planned.
- The cluster's membership. A generator that runs inside a cluster can use the number the cluster gave it on joining. Hazelcast uses the version of the member list at the moment a member joined, which stays unique even during a network split as long as at most one member joins during the split ([Hazelcast](https://docs.hazelcast.com/hazelcast/5.5/data-structures/flake-id-generator)).
- The pod's ordinal. In Kubernetes, the pods of a StatefulSet are numbered 0, 1, 2, and so on, and the number can serve as the node number. Kubernetes runs at most one pod with each name, except when someone force-deletes a pod on a node it cannot reach: the old pod may still be running when its replacement starts ([Kubernetes](https://kubernetes.io/docs/tasks/run-application/force-delete-stateful-set-pod/)).
- Bits of the IP address. Sonyflake takes the lower 16 bits of the private IP address by default. They are unique only while every generator sits in one network of at most 65,536 addresses.
- Random bits. Each generator picks a random node number at start, as Bluesky does with 10 bits ([AT Protocol](https://atproto.com/specs/tid)). This needs no coordination but only lowers the risk: with 1,024 values, 38 generators already have about a 50% chance that two of them share a number. Bluesky counts in microseconds, so two generators that share a number also have to use the same timestamp to clash.

::diagram{name="node-number-ways"}

A freed number needs one more wait. The generator that takes it next, after a lease ended or a pod was replaced, may have a clock behind the old owner's, and until its clock passes the last millisecond that owner used, it makes the same IDs again. So it waits past that time, for example the end of the old lease plus the largest clock difference allowed between servers and the furthest a generator may run ahead of its clock.

::diagram{name="node-reuse"}

:::do
Take node numbers from a store that guarantees uniqueness: a new number from a table at every start where the bits allow it, or a claim under a lease in a coordination service. Have a generator stop making IDs when it can no longer prove that its number is its own, and give a freed number to a new generator only after the old owner has surely stopped and its last millisecond has passed on the new one's clock.
:::

## Clocks that go back

A generator's clock runs 5 ms fast, and NTP sets it back. The generator now reads milliseconds it has already used, starts the sequence from 0 again, and makes IDs it has already given out. A time-of-day clock goes back after a sync, a pause of a virtual machine, a leap second, or a manual change (more on [clocks that disagree](../../fundamentals/consistency/#clocks-that-disagree)).

The generator remembers the last millisecond it used, so it can notice:

```python
now = current_millis()
if now < self.last_ms:
    if self.last_ms - now > MAX_BACK_MS:
        raise ClockWentBack(self.last_ms - now)  # alert, stop
    now = wait_until(self.last_ms)
```

- Wait. Refuse to make IDs until the clock passes the last millisecond used. Twitter's Snowflake refuses requests until then, and the app retries. For a few milliseconds it costs nothing visible, but a jump of seconds stalls every insert, so above a limit the generator fails and raises an alert.
- Borrow from the future. Keep counting from the last millisecond used, and when its sequence runs out, move on to the next millisecond even if the clock has not reached it, up to a limit. Hazelcast's generator never goes below the last time it used, may run ahead of the clock by up to 15 seconds by default, and then blocks ([Hazelcast](https://docs.hazelcast.com/hazelcast/5.5/data-structures/flake-id-generator)). The generator keeps working through small steps back and through bursts, and its IDs show a time slightly in the future.

::diagram{name="clock-back-options"}

Both checks work only while the generator remembers the last millisecond. A generator that restarts with a clock behind the time it last used has nothing to compare with. Take a new node number at every start, never reused. Or reserve time the way blocks of IDs reserve numbers: save a time a few seconds ahead of the clock before making IDs up to it, never make an ID past the saved time until a later one is saved, and after a restart, wait until the clock passes the saved time.

::diagram{name="time-reservation"}

The best fix is a clock that does not go back. Configure the time sync to slew the clock, that is, to make it run slightly slower until it is correct, rather than step it back. A leap second can be smeared over hours the same way.

:::do
Make the generator remember the last millisecond it used, wait out small steps back, and stop with an alert on large ones. Configure time sync to slew rather than step, and after a restart, either use a new node number or wait past the last time saved before use.
:::

## Time-ordered IDs without node numbers

The marketplace adds a table of notifications, and its keys do not have to fit 64 bits. Node numbers and clock checks exist because 64 bits leave too few bits for chance. With 128 bits, the bits after the time can be random, and enough random bits make the node number unnecessary.

**UUIDv7** is the time-ordered version of the UUID, standard since 2024 ([RFC 9562](https://www.rfc-editor.org/rfc/rfc9562#name-uuid-version-7)). It starts with 48 bits of Unix time in milliseconds, 6 bits mark the format, and the other 74 bits are random, though a generator may use some of them to keep order. Sorted as bytes or as text, UUIDv7 roughly follows the time of creation, as closely as the generators' clocks agree, and it fits any `uuid` column. New keys land near the end of a B-tree index, as numbers do. **ULID** is an older format with the same idea: 48 bits of milliseconds and 80 random bits, written as 26 characters of Crockford's Base32, which leaves out I, L, O, and U so that they are not mistaken for 1 and 0 ([ULID](https://github.com/ulid/spec)). Pick UUIDv7 where the database has a `uuid` type, and ULID where IDs are text anyway.

::diagram{name="uuidv7-vs-ulid"}

Within one millisecond, random bits sort in random order. When the order within a millisecond matters, the generator uses some of the random bits for a counter or for a finer part of the time; the RFC describes both. Implementations differ:

- PostgreSQL 18's `uuidv7()` puts a fraction of the millisecond into 12 bits, which keeps the IDs of one connection growing even when the clock goes back, but not across connections ([PostgreSQL](https://www.postgresql.org/docs/18/functions-uuid.html), [Leach](https://brandur.org/fragments/uuid-v7-monotonicity)).
- Python 3.14's `uuid.uuid7()` keeps a 42-bit counter within the millisecond ([Python](https://docs.python.org/3.14/library/uuid.html#uuid.uuid7)).
- Many libraries add no counter, and IDs within one millisecond fall in random order.

::diagram{name="same-ms-order"}

The RFC notes that for one database, IDs made by the database itself keep the best order. IDs made by many app servers interleave by their clocks, which is fine for a B-tree.

Two companies measured the switch. Buildkite (2023) moved to time-ordered UUIDs and, together with other changes over six weeks, cut the write-ahead log of its main database by half; it now uses UUIDv7 as the primary key of new tables, ahead of sharding by organization ([Buildkite](https://buildkite.com/resources/blog/goodbye-integers-hello-uuids/)). Setting the version field to 7 broke some customers' code that checked UUIDs and did not know version 7 yet. Shopify (2022) switched the keys that make payment retries safe from UUIDv4 to ULID and saw INSERT time fall by 50% in one high-throughput system ([Shopify](https://shopify.engineering/building-resilient-payment-systems)).

The time inside the ID is visible to anyone who sees it. The RFC suggests UUIDv4 where the creation time must stay hidden. A UUIDv7 also takes 16 bytes, twice a `bigint`. TypeID puts a type prefix in front of a UUIDv7 written in Base32, `ord_01h455vb4pex5vsknk084sn02q`, which joins time order with the prefixes of [IDs that outsiders see](#ids-that-outsiders-see) ([TypeID](https://github.com/jetify-com/typeid)).

:::do
For new tables whose IDs are made in several places or must be unique beyond one database, and where 16-byte keys are fine, use UUIDv7, made by the database where it can make it. Use UUIDv4 where the creation time must stay hidden, and a Snowflake-style ID where the key must fit in 64 bits.
:::

## Finding the shard from the ID

A buyer opens `/orders/{id}`. Orders are split by seller, but the request carries only the order ID, so the app does not know which database to ask. It could ask all of them, or keep a table from each order ID to its database and look it up first.

Put the shard into the ID. Instagram (2011) split its data into thousands of logical shards, each a separate set of tables in PostgreSQL, and built a 64-bit ID from 41 bits of milliseconds, 13 bits of logical shard, and 10 bits from a sequence in that shard ([Instagram](https://web.archive.org/web/20121221135907/http://instagram-engineering.tumblr.com/post/10853187575/sharding-ids-at-instagram)). A function next to each shard's tables makes the ID as the column's default, so the insert returns it with `RETURNING` and no separate generator runs. Instagram's layout fills all 64 bits, so in a signed `bigint` its IDs turn negative after about 35 years. This version for logical shard 42 keeps the top bit 0 and uses 12 bits for the shard, up to 4,096 logical shards:

```sql
CREATE FUNCTION shard_42.next_id(OUT id bigint) AS $$
DECLARE
  epoch_ms bigint := 1735689600000;  -- 2025-01-01
  shard_no bigint := 42;
  seq      bigint;
  now_ms   bigint;
BEGIN
  SELECT nextval('shard_42.orders_id_seq') % 1024
  INTO seq;
  SELECT floor(extract(epoch FROM clock_timestamp()) * 1000)
  INTO now_ms;
  id := ((now_ms - epoch_ms) << 22) | (shard_no << 10) | seq;
END;
$$ LANGUAGE plpgsql;
```

The router reads the shard back with `(id >> 10) & 4095` and finds its server in the map from logical shards to servers (more on [logical shards](../../fundamentals/sharding/#adding-nodes-without-moving-every-key)). The logical shard serves as the node number, and it is unique by design. The last 10 bits allow 1,024 IDs per millisecond per table and shard: the 1,025th row in one millisecond repeats the first one's ID, and the primary key rejects it. The insert's transaction is then aborted, so the app rolls it back and retries the whole transaction a millisecond later. A clock that steps back can cause the same clash at a lower rate. Keep the sequence's `CACHE` at 1: with batches per connection, two connections can hold values 1,024 apart and repeat an ID at any rate.

::diagram{name="shard-in-id"}

The shard bits tie each ID to where its record lived when it was created. To keep routing without a lookup, move records between servers only as whole logical shards: a single seller moved to another logical shard keeps IDs that point to the old one, and finding them needs a table of exceptions again. The bits for the shard also come out of the time and the sequence. When IDs are 128 bits, UUIDv8 leaves the layout to you and can carry a shard number in the same way.

:::tradeoff
A shard number in the ID routes every request without a lookup. In return, records can move without a lookup table only together with their logical shard, and the shard takes bits from the time and the sequence.
:::

## Ordered keys in a store split by key ranges

The marketplace moves order lines to a distributed SQL database that splits each table into ranges of keys and spreads the ranges over nodes, as CockroachDB, Spanner, and TiDB do. Keys from a sequence, a Snowflake generator, or UUIDv7 all grow over time, so every new row goes to the last range, and one node takes all the inserts (more on [splitting by key ranges](../../fundamentals/sharding/#splitting-by-key-ranges)).

This reverses the advice for a B-tree on one server. One index on one server wants new keys close together, so inserts touch few pages. A store split by key ranges wants them far apart, so inserts spread over nodes. A store that places keys by hash spreads them whatever their order.

The fixes spread the keys:

- Random keys. UUIDv4 spreads inserts evenly once the table has split into ranges, and Spanner and CockroachDB recommend it as the default primary key ([Spanner](https://docs.cloud.google.com/spanner/docs/primary-key-default-value), [CockroachDB](https://www.cockroachlabs.com/docs/stable/performance-best-practices-overview#unique-id-best-practices)).
- Numbers spread over the range. A **bit-reversed sequence** counts as usual but reverses the order of the bits before it returns a number, so consecutive numbers land far apart and stay unique. Spanner uses them for its identity columns. TiDB's `AUTO_RANDOM` puts a few shard bits, 5 by default, near the top of a 64-bit key ([TiDB](https://docs.pingcap.com/tidb/stable/auto-random/)), and CockroachDB's `unordered_unique_rowid()` reverses the bits of the time part of its ID.
- A spread column first. Key the rows by `(seller_id, id)`: inserts spread over the ranges of all active sellers, and one seller's orders stay together for range reads.
- A hash bucket first. The store adds a hidden column of hash(key) mod N in front of the key, which spreads inserts over N ranges. A read of a range of keys then asks all N buckets. <!-- link: technologies/distributed-sql -->

::diagram{name="spread-inserts"}

Random keys, spread numbers, and hash buckets give up what ordered keys gave: the newest rows no longer sit together. "The latest orders of all sellers" then needs a secondary index that starts with the time, and that index has the same hot range, so it needs hash buckets too. A spread column first keeps each seller's newest orders together, which is often the query that matters. The same choice applies to every index that takes many inserts, not only the primary key.

:::avoid
Starting the primary key or any busy index with a sequence, a timestamp, or a time-ordered ID in a store split by key ranges, for a table with many inserts. One range on one node takes them all, and adding nodes does not help.
:::

## Short codes people type and share

Sellers share products by text message, with a link such as `market.example/p/7Fk2Q9a`. The code at the end must be short, safe in a URL, and easy to type from a screen.

A **short code** is an ID made for people to type and share, and it uses a large alphabet to stay short. **Base62** uses the digits and the lower- and uppercase letters, 62 characters that need no escaping in a URL. The count holds only if every part of the system tells `a` from `A`: a unique index that ignores case, as many MySQL collations do, sees fewer codes and lets two links clash. N characters give 62ᴺ codes: 6 give about 57 billion, 7 about 3.5 trillion. When people read codes aloud or type them from paper, drop the characters that look alike (0 and O, 1, l, and I), and make the code one character longer to make up for the smaller alphabet. Random codes can also spell words, so check new codes against a list of words to avoid.

There are three ways to make the code:

- Encode a number. Take an ID from a generator and write it in base62. Codes never clash and are as short as they can be, but they come in order: anyone can list every product by counting, and the codes show how many exist. Run the number through a permutation keyed by a secret, such as a small block cipher over the whole range of numbers, before encoding it. The codes then look random and still never clash, as long as the key and the range never change.
- Pick a random code. Generate N random characters and insert them with a unique constraint; on a clash, pick again. Clashes come early: by the birthday bound, with 7 characters there is already a 50% chance of some clash after about 2.2 million codes. Each clash only costs a retry. The chance that one new code hits a taken one is the share of codes in use: with 1 billion codes taken, about 0.03%. Limit the retries, and make codes longer before that share grows.
- Hash the content. Take the first characters of a hash of the long link, so the same link gets the same code. A cut hash clashes like a random code: on a clash, compare the stored link, reuse the code if the link is the same, and otherwise hash again with a salt. A link that got a salted code is no longer found by its hash, so finding repeated links needs an index on the link itself. Two users who share the same link also get one code, so they cannot have separate statistics.

::diagram{name="short-code-ways"}

Codes that people choose, such as `p/summer-sale`, go into their own namespace, so a random code can never take a chosen one. How to build a whole link shortener, with redirects, caching, and expiry, is a separate design. <!-- link: systems/url-shortener -->

:::do
For short public codes, use random base62 codes with a unique constraint and a few retries, or a number run through a secret permutation when codes must never clash. Size the length for the codes you expect, so the share of codes in use stays small.
:::

## Picking an ID scheme

Most systems use several schemes at once, one for each need:

| Need | Scheme | Cost |
|---|---|---|
| Compact keys made by one database | `bigint` identity | Gaps; numbers show the count |
| Readers that need the commit order | The database's log, or a counter row at commit | A log reader to run; writers that take turns |
| Documents numbered without gaps | A counter row per series | One writer per series at a time |
| IDs shown to outsiders | A random public ID with a type prefix | A second column and index |
| 64-bit numbers across databases | Blocks of IDs from one counter | Gaps; order only within a block |
| IDs made anywhere, revealing nothing | UUIDv4 | 16 bytes; random inserts in a B-tree |
| Time order in 64 bits | Snowflake-style ID | Node numbers and clock checks |
| Time order, 128 bits allowed | UUIDv7 | 16 bytes; shows creation time |
| The shard known from the ID | Shard bits in the ID | Records move without a lookup only with their logical shard |
| A store split by key ranges | UUIDv4, a bit-reversed sequence, or a spread column first | No locality for the newest rows |
| Short codes people type | Random base62 with a unique constraint | Retries; a length to size |

The marketplace ends with UUIDv7 keys, made by the database, for orders and messages; a random public ID with a prefix in every link and API, since a UUIDv7 shows when an order was made; a counter row per seller and year for invoices; random 7-character codes for shared links; and order lines in the distributed store keyed by seller first. Its oldest tables keep their `bigint` keys: an ID scheme is hard to change once other tables, systems, and customers store the IDs.

:::explain
Ask what the IDs must do before you pick a generator: fit in 64 bits, follow creation time, be made without a round trip, hide the count, or have no gaps. Then name the scheme, what it costs, and how it fails: who assigns node numbers, what happens when a clock goes back, and where the unique key catches a duplicate.
:::

## Cheat sheet

- In one database, use a `bigint` identity column. A sequence promises unique numbers only: it leaves gaps, and when it hands out numbers in batches, numbers from different connections interleave.
- Rows commit out of their ID order, so a reader that pages past the largest ID it has seen skips rows. Read the database's log, page by the start time of the writing transaction and stay behind the newest rows by more than the longest transaction a timeout allows, on a clock that does not jump, or number rows at commit through a counter row.
- For numbers without gaps, take the next number from a counter row per series in the transaction that writes the document, as its last step. Give the number at issue, never delete an issued document, and use `row_number()` when only the display needs it.
- Check access on every request. Give outsiders a random public ID with a unique constraint and a type prefix, since numbers in order show the count; encoding a number does not hide it.
- Across databases: step and offset fix the number of databases, a ticket server adds a round trip and a single point of failure, and blocks of IDs from one counter make requests rare at the cost of gaps and rough order. The counter must commit each block before use and never give it twice, also after a failover.
- UUIDv4 lets anything create an ID without asking and reveals nothing, at the cost of 16 bytes and random inserts into a B-tree. A client-made ID makes retries safe, but when it already exists, treat the request as a retry only if the row has the same owner and the same content.
- A Snowflake-style ID puts milliseconds, a node number, and a sequence into 64 bits. It sorts only as well as the clocks agree, shows the creation time, and travels as a string in JSON.
- A node number must be unique among running generators. Take it from a store that guarantees uniqueness, under a lease or new at every start, and stop making IDs when the generator cannot prove it still owns it. Reuse a number only after its old owner's last millisecond has passed.
- A generator must remember the last millisecond it used: wait out small steps back, stop with an alert on large ones, and after a restart use a new node number or wait past a time saved before it was used. Slew clocks rather than step them.
- UUIDv7 and ULID put the time first and random bits after it, so they need no node numbers. Use UUIDv7 for new tables whose IDs come from several places when 16 bytes are fine, and UUIDv4 when the creation time must stay hidden.
- A logical shard number in the ID routes requests without a lookup, as long as records move only with their logical shard. Watch the per-millisecond limit of the sequence bits.
- In a store split by key ranges, keys that grow over time send all inserts to one range. Use UUIDv4, a bit-reversed sequence, a spread column first, or hash buckets, for every busy index.
- Short codes: base62, with the length sized so the share of codes in use stays small. Use random codes with a case-sensitive unique constraint and retries, or a number run through a fixed secret permutation.
- Pick a scheme per need, and pick early: once other tables, systems, and customers store the IDs, the scheme is hard to change.

## Sources

- Martin Kleppmann, Chris Riccomini. [Designing Data-Intensive Applications](https://www.oreilly.com/library/view/designing-data-intensive-applications/9781098119058/), 2nd edition. O'Reilly, 2026. Chapter 10.
- Anthony Accomazzo. [Postgres sequences can commit out-of-order](https://blog.sequinstream.com/postgres-sequences-can-commit-out-of-order/). Sequin blog, 2024.
- Laurenz Albe. [Gaps in sequences in PostgreSQL, causes and remedies](https://www.cybertec-postgresql.com/en/gaps-in-sequences-postgresql/). Cybertec, 2021.
- Kyzer Davis, Brad Peabody, Paul Leach. [RFC 9562: Universally Unique IDentifiers (UUIDs)](https://www.rfc-editor.org/rfc/rfc9562). IETF, 2024.
- Flickr. [Ticket Servers: Distributed Unique Primary Keys on the Cheap](https://code.flickr.net/2010/02/08/ticket-servers-distributed-unique-primary-keys-on-the-cheap/). Flickr Code blog, 2010.
- Instagram Engineering. [Sharding & IDs at Instagram](https://web.archive.org/web/20121221135907/http://instagram-engineering.tumblr.com/post/10853187575/sharding-ids-at-instagram). Instagram Engineering blog, 2011 (archived copy).
- Twitter. [Snowflake](https://github.com/twitter-archive/snowflake/tree/snowflake-2010), README of the 2010 version. GitHub, 2010.
