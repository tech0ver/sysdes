---
title: Transactions
description: How a database keeps data correct under concurrent access and crashes on one node, from atomic writes to isolation levels, locks, and retries.
---

Every system design has writes that must happen together and data that many users change at once, and a crash or a race between them can leave that data wrong. To defend a design, you need to know what a transaction guarantees, which races the database still lets through, and how to guard a rule that it does not check for you.

## Changing several rows at once

A concert ticket service sells numbered seats in a hall. A purchase writes to three tables: it creates an order, marks each chosen seat as sold, and records the payment.

```sql
INSERT INTO orders (id, buyer_id, event_id, total)
VALUES (501, 42, 7, 180);

UPDATE seats
SET status = 'sold', order_id = 501
WHERE event_id = 7
  AND seat_no IN (14, 15);

INSERT INTO payments (order_id, amount)
VALUES (501, 180);
```

If the server crashes after the second statement, the seats are sold, but the order has no payment. Nobody else can buy those seats, and no payment is recorded for them. The same happens when the third statement fails a constraint.

A **transaction** groups statements into one unit. `BEGIN` starts it, and **commit** makes all of its changes permanent at once. A **rollback** discards all of them. The app calls `ROLLBACK` when a check or a statement fails, and after a crash the database rolls back every transaction that did not commit. This all-or-nothing rule is **atomicity**: a failure never leaves half an order behind.

```sql
BEGIN;
INSERT INTO orders ...;
UPDATE seats ...;
INSERT INTO payments ...;
COMMIT;
```

Without `BEGIN`, most databases and drivers run in **autocommit** mode: each statement is a transaction of its own and commits when it ends. One statement is atomic even when it changes many rows, but the three statements of a purchase become three transactions, and a crash between them leaves half an order.

::diagram{name="half-order"}

A commit is final. To undo a sale, a new transaction does the opposite, such as returning the seats and recording a refund. Actions outside the database, such as sending the tickets by email, are not part of the transaction, and a rollback cannot take them back. Do them after the commit. A crash right after the commit would lose such an action, so record it in the same transaction, as an outbox does, and send it from there.

:::do
Put every set of changes that must happen together into one transaction, and keep only database work inside it. Send emails and other outside actions after the commit, from a record written in the same transaction.
:::

A crash can still stop the database in the middle of a transaction.

## Undoing a half-done transaction

When the database itself crashes, a purchase may be half written. The new order row and the sold seats sit in pages in memory, some of those pages may already be on disk, and the payment row is not written yet. On restart, the database must keep every committed purchase and remove every unfinished one.

It uses the WAL for this. Every change of a transaction goes to the log before the page it changes reaches disk. At commit, the database appends a **commit record** to the log and flushes the log. The transaction is committed at the moment this record is on disk, and only then does the app get "ok". The changed pages are written later.

After a crash, the database reads the log. A transaction with a commit record is kept: if some of its pages never reached disk, the database writes its changes again from the log. A transaction without a commit record is removed. To keep this work short, the database writes changed pages to disk from time to time and marks a **checkpoint** in the log, so recovery starts from the last checkpoint instead of the beginning.

::diagram{name="wal-recovery"}

Two common designs remove an unfinished transaction:

- **Undo log.** Before a row is changed in place, its old value is saved to a separate undo area. A rollback copies the old values back, so it costs about as much as the transaction itself, while a commit is cheap. Oracle and MySQL work this way.
- **Row versions.** A change writes a new version of the row next to the old one, tagged with the ID of its transaction. A rollback only marks the transaction as aborted, and readers skip its versions. Rollback is cheap, but dead versions take space until a background cleanup removes them. PostgreSQL works this way.

::diagram{name="undo-vs-versions"}

A few stores keep no log for this: they write changed pages to new places and, at commit, switch a single pointer from the old pages to the new ones.

The promise that a committed transaction survives a crash is **durability**. It holds only while the database says "ok" after the commit record is flushed. A database set to answer earlier can lose the last commits, even though the app was told they succeeded (more on [when a write is durable](../storage-engines/#surviving-a-crash)).

:::explain
If asked what a crash does to a transaction in progress, say that a transaction is committed once its commit record is flushed to the log. Recovery keeps every transaction with a commit record and removes the rest, so each transaction is either fully applied or not applied at all.
:::

## Two writers on one value

Sales open, and many buyers arrive at once. Besides numbered seats, the hall has a standing zone, sold by count. The event row keeps how many standing places are left, and a purchase reads the count, subtracts the tickets, and writes the result back:

```sql
SELECT standing_left
FROM events
WHERE id = 7;
-- 10

UPDATE events
SET standing_left = 8  -- the app computed 10 - 2
WHERE id = 7;
```

Two buyers do this at the same time. Both read 10, both write 8. Four tickets are sold, but the count drops by two. This is a **lost update**: a write overwrites another write that it never saw. Putting both statements into one transaction does not help with the default settings of most databases: a transaction does not stop another one from reading the same row in between.

The fix is to let the database compute the new value from the current one, in one statement:

```sql
UPDATE events
SET standing_left = standing_left - 2
WHERE id = 7
  AND standing_left >= 2;
```

This is an **atomic update**. The database reads and changes the row in one step. A second writer of the same row waits until the first transaction ends; under read committed, it then works from the new value. The condition in `WHERE` keeps the rule "never below zero": when fewer than two places are left, the statement changes no rows, and the app tells the buyer the zone is sold out. The count of changed rows is the answer, so the app never needs a separate read. A `CHECK (standing_left >= 0)` constraint can back the rule up, so that a bug elsewhere cannot break it.

::diagram{name="lost-update"}

Sometimes the app must compute the new value itself, for example with a pricing rule the database does not know. Then it uses **compare-and-set**: it writes the new value only if the old one is still there, `UPDATE ... SET standing_left = 8 WHERE id = 7 AND standing_left = 10`. If no rows change, another writer got there first, and the app reads again and retries. Key-value stores offer the same two tools: an increment command and a conditional write.

::diagram{name="compare-and-set"}

:::do
Change a value with one statement that computes it from the current value and puts the rule into `WHERE`, then check how many rows changed. Use compare-and-set when only the app can compute the new value. Never read a value, change it in the app, and write it back unguarded.
:::

## Seeing unfinished changes

Hundreds of purchases now run at the same time, and each one is a transaction that takes a few milliseconds. While one purchase has sold seats 14 and 15 but not yet written its payment, other transactions keep reading and writing the same tables.

Two things can go wrong. A **dirty read** sees changes that are not committed yet. Another buyer's seat map shows seats 14 and 15 as sold; then the purchase fails and rolls back, and the buyer who gave up on those seats saw a sale that never happened. A **dirty write** overwrites a change that is not committed yet. Purchase A sells seat 14 and then seat 15, purchase B sells seat 15 and then seat 14, and their steps interleave: A writes 14, B writes 15, B overwrites 14, A overwrites 15. Seat 14 ends up in B's order and seat 15 in A's, so each buyer gets only one of the two seats they paid for.

::diagram{name="dirty-read-write"}

**Isolation** keeps concurrent transactions from seeing or overwriting each other's unfinished work. Its basic level is **read committed**, and it blocks both problems:

- A transaction that writes a row takes a **lock** on it and holds it until it commits or rolls back. Another writer of that row waits for the lock, so no write lands on top of an uncommitted one.
- A reader sees only committed values. While a row has an uncommitted change, most databases give readers its last committed version, taken from the undo log or the older row version, so readers do not wait for writers. A database that keeps no versions makes the reader wait until the writer ends.

::diagram{name="read-committed"}

Read committed is the default in PostgreSQL, Oracle, and SQL Server. The level below it, **read uncommitted**, allows dirty reads and is rarely useful.

Read committed hides other transactions' unfinished changes, but committed data can change between two statements of one transaction.

## Reading a consistent picture

The organizer's sales report counts sold seats and sums payments for the event, in two queries inside one transaction. Between the two queries, a purchase commits. The report counts seats without that purchase and payments with it, so the two totals disagree. Each query read committed data, but they read it at different moments. This is **read skew**. Reading the same row twice in one transaction and getting two values is the simplest form of it, a **non-repeatable read**.

The cure is **snapshot isolation**. A transaction reads from a snapshot of the database as of its start: commits that happen later are invisible to it, and its own writes are visible only to itself until it commits. The report then sees the event as it was at one moment, and both totals agree.

::diagram{name="read-skew"}

Databases implement snapshots with **MVCC** (multi-version concurrency control). A row can have several versions at once. In one common layout, each version records the transaction that created it and the transaction that replaced or deleted it. A snapshot is, in effect, the list of transactions that had committed when it was taken. To read a row, a transaction picks the newest version whose creator is in its list and whose replacer is not. In a database with versions, read committed uses the same machinery for plain reads but takes a new snapshot for each statement instead of one for the whole transaction.

::diagram{name="mvcc-versions"}

Plain reads never block writers, and writers never block plain reads. Only two writers of the same row still wait for each other. So a long report runs next to the purchases without blocking them.

A database without versions gets repeatable reads with locks instead. A reader takes a **shared lock** on every row it reads: other readers may hold it too, but a writer must wait until it is released. The reader keeps these locks until it commits, so nobody can change the rows it has read, and a second read returns the same value. This is less than a snapshot: rows the reader has not read yet, such as a new payment, can still change, so the two totals of a report can still disagree. The price is that readers and writers block each other, and a long report stalls the purchases. This is why most databases moved to versions. They still take a shared lock when a query asks for it, to keep a row from changing until the transaction ends:

```sql
SELECT status
FROM seats
WHERE event_id = 7
  AND seat_no = 14
FOR SHARE;
```

::diagram{name="versions-vs-shared-locks"}

The SQL standard names the level that rules out non-repeatable reads **repeatable read**. Databases with versions usually provide it as snapshot isolation, and databases without them with shared locks.

The old versions live where rollback finds them: in the undo log, or as older row versions in the table. They are kept as long as any snapshot may still need them, and that is the cost. One long transaction, even a read-only one, or one that the app opened and forgot to close, holds back the cleanup of old versions; in some databases this covers the whole database, including tables it never touched. Tables and indexes grow, scans slow down, and in undo-based databases a long query can fail when the versions it needs have already been dropped.

:::do
Run reports and other multi-statement reads in a read-only transaction with snapshot isolation. Keep every transaction short, and set a timeout that closes transactions left open and idle.
:::

## Checking, then writing

A buyer picks seats 14 and 15 on the seat map and presses "Buy". The purchase first checks that both seats are still free, then sells them:

```sql
SELECT seat_no
FROM seats
WHERE event_id = 7
  AND seat_no IN (14, 15)
  AND status = 'free';
-- 2 rows

UPDATE seats
SET status = 'sold', order_id = 501
WHERE event_id = 7
  AND seat_no IN (14, 15);
```

Two buyers pick the same seats at the same moment. Both checks find the seats free, both purchases go on, and the second update overwrites the first. Both buyers paid, and the seats belong to one of them. This is a lost update again, but now the read decides whether the whole purchase goes ahead. Read committed does not stop it: the check saw committed data, and that data changed before the write.

::diagram{name="check-then-write"}

The simplest fix moves the check into the write, the same way as for a single value:

```sql
UPDATE seats
SET status = 'sold', order_id = 501
WHERE event_id = 7
  AND seat_no IN (14, 15)
  AND status = 'free';
```

If fewer than two rows change, another buyer took a seat first. The purchase rolls back, so it does not keep one seat of the pair.

Sometimes the check does not fit into one statement: the app reads several rows, applies rules the database does not know, and only then decides. Then it locks the rows as it reads them:

```sql
SELECT seat_no, status
FROM seats
WHERE event_id = 7
  AND seat_no IN (14, 15)
FOR UPDATE;
```

`FOR UPDATE` takes the same lock that a write takes and holds it until the transaction ends. A second buyer's `FOR UPDATE` on those seats waits, and once it gets the lock, it reads the seats as sold under read committed, or fails with an error under snapshot isolation. Plain reads do not wait: they get the last committed version. This is **pessimistic locking**: expect a conflict and block it before it happens. Its cost is waiting. The rows stay locked while the app works, so nothing slow, such as a call to another service, may run inside the transaction.

The other way lets both purchases run and checks at the write. Each row has a version number that every update increases. The app reads the version together with the row, and the update succeeds only if the version is still the same:

```sql
SELECT status, version
FROM seats
WHERE event_id = 7
  AND seat_no = 14;
-- 'free', 3

UPDATE seats
SET status = 'sold', order_id = 501, version = 4
WHERE event_id = 7
  AND seat_no = 14
  AND version = 3;
```

If no rows change, another transaction wrote the row in between, and the app rolls back, reads again, and decides again. This is **optimistic locking**: compare-and-set on a whole row, with the version in place of the old value. No lock is held between the read and the write, so the read may even happen in an earlier transaction. The check covers only the rows the transaction writes: a row it only read can change without anyone noticing.

::diagram{name="pessimistic-vs-optimistic"}

Under snapshot isolation, the database makes this check itself. When two concurrent transactions write the same row, it lets only one of them commit. The other fails with a **serialization error**, and the app runs the whole transaction again. Lost updates then need no extra code, but every transaction that writes must be ready for a retry.

:::do
Put the check into the write when it fits one statement. Otherwise, lock the rows on read when many transactions want the same rows at once, and use a version check when conflicts are rare. Under heavy contention, optimistic retries pile up, and most of the work is thrown away.
:::

Locks can also make two transactions wait for each other forever.

## Waiting for each other

Two buyers want seats 5 and 6. One purchase sells seat 5 and then seat 6, the other sells seat 6 and then seat 5, in the order each buyer clicked them. The first locks seat 5, the second locks seat 6, and then each waits for the lock that the other holds. Neither can go on, and neither releases its lock. This is a **deadlock**. It needs no `FOR UPDATE`: plain updates take the same locks. Even one statement that changes many rows takes their locks one by one, so two such statements can deadlock as well.

The database finds deadlocks itself. It tracks which transaction waits for which, and a cycle in that graph is a deadlock. It picks one transaction in the cycle as the victim and aborts it with an error, so the others can go on. Some databases undo only the victim's last statement, so the app rolls the transaction back itself and runs it again; by then the other purchase has committed, and the retry sees the seats as sold.

It is better not to form the cycle at all. When every transaction takes its locks in the same order, for example sorted by key, the second purchase waits for seat 5 while it holds nothing, and no cycle can form. The app locks the seats one by one in sorted order. Sorting the numbers inside one `IN (...)` list is not enough: the database decides in which order one statement locks its rows.

::diagram{name="deadlock"}

Not every long wait is a deadlock. A transaction can wait behind a slow one, and the database cannot tell how long that will take. A **lock timeout** caps the wait: a transaction that waits longer fails, and the app retries it or gives up. A timeout that is too short aborts transactions that were only slow, and one that is too long keeps buyers waiting. When waiting makes no sense, `NOWAIT` fails at once if the row is locked, and the buyer learns right away that someone else is buying those seats.

:::do
Take locks in one fixed order, for example sorted by key, and keep transactions short. Set a lock timeout, and roll back and retry a transaction that the database aborted to break a deadlock.
:::

## A rule across several rows

The organizer limits sales to four tickets per buyer for each event. A purchase now counts the seats the buyer already has and sells new ones only if the total stays within the limit:

```sql
SELECT count(*)
FROM seats
JOIN orders ON orders.id = seats.order_id
WHERE seats.event_id = 7
  AND seats.status = 'sold'
  AND orders.buyer_id = 42;
-- 0

UPDATE seats
SET status = 'sold', order_id = 502
WHERE event_id = 7
  AND seat_no IN (21, 22, 23)
  AND status = 'free';
```

A buyer opens the site in two tabs and buys three seats in each at the same moment. Both purchases count zero, both see that 0 + 3 is within the limit, and both sell. The buyer ends up with six tickets. The purchases wrote different seats, so no two writes touched the same row: their row locks never met, snapshot isolation saw no conflict, and a version check on the written seats passed. Each transaction kept the rule on its own, and together they broke it. This is **write skew**: two transactions read the same data, decide on it, and write different rows, and the result breaks a rule that spans those rows.

Locking the rows on read does not help either: it locks the buyer's seats that exist, and the buyer has none yet, so nothing is locked. The rows that matter start to match the count only when the other purchase writes them. A write that changes the result of another transaction's search is a **phantom**: the rows that match the search now did not match when it ran, so there was nothing to lock.

The limit is one of the rules that make the data correct. Keeping the data within its rules is **consistency**. The database enforces the rules it is told about, such as constraints. A rule across several rows is usually the app's job, and atomicity and isolation are its tools for it.

:::distinguish
"Consistency" in transactions means that the data follows its rules. For [copies of data on several nodes](../replication/#reading-from-a-copy-that-is-behind), the same word means whether every copy shows the same value (more on [guarantees between copies](../consistency/#acting-as-one-copy)).
:::

The fix turns the rule into a row that every such transaction writes, so the conflict becomes an ordinary conflict on one row. This is **materializing the conflict**. Keep a count of tickets per buyer and event, and change it with an atomic update that carries the rule:

```sql
UPDATE buyer_tickets
SET tickets = tickets + 3
WHERE event_id = 7
  AND buyer_id = 42
  AND tickets + 3 <= 4;
```

Both purchases now write the same row. The second one waits for the first, then fails the check and rolls back. The row must exist before the update, so the purchase first inserts it with an insert that does nothing when the row is already there.

::diagram{name="write-skew"}

A unique constraint is the same idea for a rule of the form "at most one". Two inserts of the same key conflict in the index, even though neither row existed before. When selling a seat inserts a row into a table of tickets with a unique key on the event and the seat, a double sale is impossible, whatever the app does.

:::do
When a rule spans several rows, make every transaction that can break it write one shared row, such as a counter, or express the rule as a unique constraint. Snapshot isolation and version checks do not stop write skew, and row locks do not stop phantoms.
:::

Every such rule needs its own guard, and one missed rule is enough to break the data.

## Running as if one at a time

Rules keep coming: four tickets per buyer, one use per promo code, no seats in a closed zone. Each one needs its own guard, and any new feature can bring a rule that nobody guards. The database can take over this job. **Serializable** isolation promises that concurrent transactions end with the same result as if they had run one after another, in some order. Every anomaly so far becomes impossible, and a transaction that keeps a rule when it runs alone also keeps it next to others.

Databases provide it in three ways.

**Serial execution.** One thread executes transactions one after another, so they never overlap. It is fast when every transaction is very short: the data sits in memory, and the app sends the whole transaction at once, as a script or a stored procedure, instead of statement by statement with round trips in between. One thread uses one CPU core, which caps throughput. Splitting the data into parts with a thread each raises the cap, but a transaction that spans several parts becomes slow.

**Two-phase locking (2PL).** This is the shared-lock approach of repeatable read taken all the way. In the form databases use, a transaction takes a shared lock on everything it reads and an exclusive lock on everything it writes, and keeps them all until it ends. The name comes from its two phases: first the transaction only takes locks, then it only releases them, in practice all at once at the end. To stop phantoms, a query also locks the range it searched, usually a range of an index, so a write that adds a row to that range, or moves one into it, waits. Without a fitting index, the range can grow to the whole table. Readers and writers block each other, deadlocks are common, and one slow transaction stalls everyone behind it.

::diagram{name="range-lock"}

**Serializable snapshot isolation (SSI).** Transactions read from snapshots, as in snapshot isolation, and reads never wait. In addition, the database records what each transaction read. This tracking blocks nobody, but two writers of one row still wait for each other as usual. When the reads and writes of concurrent transactions form a pattern that no serial order could produce, the database aborts one of them with a serialization error. In the two-tab purchase, each transaction wrote rows that the other one's count read, so one of them fails, and its retry sees the other purchase. The tracking is coarse, so some aborts are false alarms. SSI works best when conflicts are rare.

::diagram{name="serializable-ways"}

The guarantee covers only transactions that run at this level. A transaction at a weaker level that writes the same data can still break the rule.

:::distinguish
Two-phase locking keeps concurrent transactions in one database apart. Two-phase commit makes one transaction commit on all of several nodes or on none of them.
:::

:::tradeoff
Serializable replaces the hand-written guards against races and rules out every anomaly. It costs throughput: one thread caps it at one core, two-phase locking makes transactions wait, and SSI aborts some of them, so the app must be ready to retry.
:::

## Choosing an isolation level

The purchases and the organizer's report need different guarantees. Each level blocks some anomalies and lets others through:

| Level | Dirty read | Lost update | Read skew | Write skew | Phantom |
|---|---|---|---|---|---|
| Read uncommitted | possible | possible | possible | possible | possible |
| Read committed | — | possible | possible | possible | possible |
| Repeatable read with shared locks | — | — | — | on new matches | possible |
| Snapshot isolation | — | — | — | possible | possible |
| Serializable | — | — | — | — | — |

Every level blocks dirty writes. A lost update here means a read in one statement and a write in another; a single atomic update is safe at every level. Write skew and phantoms here include rules over rows that a search does not find yet: a snapshot hides new rows from a repeated read, but a decision made on the snapshot still misses them.

The table follows what each level does, not what it is called. The SQL standard defines the levels loosely, and products use the names in different ways: [PostgreSQL's repeatable read](../../technologies/postgresql/#concurrent-writes-the-postgresql-way) is snapshot isolation, [Oracle's serializable](https://docs.oracle.com/en/database/oracle/oracle-database/19/cncpt/data-concurrency-and-consistency.html) is snapshot isolation as well and lets write skew through, and MySQL's repeatable read in InnoDB lets lost updates through. <!-- link: technologies/mysql --> Defaults differ too: read committed in many databases, [repeatable read in MySQL](https://dev.mysql.com/doc/refman/8.4/en/innodb-transaction-isolation-levels.html). Before relying on a level, check what the database actually does at it, for example in [independent tests](https://github.com/ept/hermitage).

Pick a level for each job, not one for the whole app:

- Read committed by default, with an explicit guard wherever a rule can break: an atomic update, a conditional write, a lock on read, a materialized conflict, or a unique constraint.
- Snapshot isolation in a read-only transaction for reports and other reads that must agree with each other.
- Serializable when the rules are many or complex enough that guarding each one by hand is risky, and a retry is cheap. Watch the share of aborted transactions: when it grows, conflicts are frequent, and explicit locks may cost less.

:::explain
If asked which isolation level to use, name the rule that can break, the anomaly that breaks it, and the cheapest guard against it. Add that the same level name means different things in different databases, so you would check the actual behavior.
:::

## Work that outlives a transaction

A buyer picks seats 14 and 15, then fills in the payment form. Checkout takes minutes, and for all that time nobody else may buy those seats. A user's action that spans several requests and minutes is a **business transaction**. Each of its steps runs as a short database transaction, and none of them stays open while the user thinks.

Keeping one database transaction open with `FOR UPDATE` through checkout hurts everyone else. Other buyers of those seats wait for minutes, the open snapshot holds back the cleanup of old versions, each buyer in checkout holds a database connection, and if the buyer leaves or the app crashes, the locks stay until a timeout. So the claim on the seats has to live in the data.

A **hold** is a state with an expiry, stored in the row. One short transaction takes it with a conditional update:

```sql
UPDATE seats
SET status = 'held', order_id = 501, held_until = clock_timestamp() + interval '10 minutes'
WHERE event_id = 7
  AND seat_no IN (14, 15)
  AND (status = 'free' OR (status = 'held' AND held_until <= clock_timestamp()));
-- 2 rows
```

If fewer than two rows change, someone else holds a seat, and the transaction rolls back. A seat counts as free when its hold has expired, so an abandoned hold needs no cleanup before the next buyer takes the seat. The expiry is compared with the database clock when the statement runs, so app servers with different clocks agree on it. In PostgreSQL, that is `clock_timestamp()`; `now()` returns the start time of the transaction, which is stale after a lock wait.

::diagram{name="business-transaction"}

When the payment succeeds, a second short transaction sells the seats, but only if the hold is still this order's and still valid:

```sql
UPDATE seats
SET status = 'sold'
WHERE event_id = 7
  AND seat_no IN (14, 15)
  AND order_id = 501
  AND status = 'held'
  AND held_until > clock_timestamp();
-- 2 rows
```

If fewer than two rows change, the hold has expired or another buyer has taken a seat, and the transaction rolls back.

A hold is pessimistic locking at the scale of a business transaction: it claims the seats before the buyer starts to pay. The optimistic variant keeps no hold. It remembers the versions of the rows the buyer saw and checks them in the final transaction, so the buyer may learn at the very end that the seats are gone. Holds fit when conflicts are likely and a late failure is costly, as with popular seats and a payment form. A version check fits when conflicts are rare. The hold can also live outside the database, as a key with a time limit in a key-value store. It is fast, but the store and the database do not share a transaction, so the final write in the database must still check the seats.

How long a hold lasts, how expired holds leave the seat map, the exact timing of expiry checks, and what to do when a payment outlives its hold are parts of [the reservation pattern](../../patterns/reservations/).

:::do
Never keep a database transaction open while a user decides. Store the claim in the data as a state with an expiry, set and check it in short transactions, and check it again in the transaction that completes the operation.
:::

## Contention on one row

Sales open at 10:00, and tens of thousands of buyers arrive in the first minute. Every standing-zone purchase updates the same counter row. Each update waits for the lock of the one before it until that transaction commits, so purchases of the zone run one at a time, however many cores the database has. The queue grows, and transactions start to hit their lock timeouts. A row that many transactions write at once is a **hot row**.

The first step is to hold its lock for less time. A row stays locked from the first write to the commit, so update the hot row as the last step of the transaction, right before the commit, and run nothing slow after it.

A bigger fix splits the row, at the cost of more rows to store and update. Instead of one counter, keep one row per standing place, and let each purchase take any free ones. Two purchases then lock different rows and do not wait for each other. `SKIP LOCKED` makes a query pass over rows that other transactions have locked and take the next free ones:

```sql
BEGIN;

SELECT id
FROM standing_places
WHERE event_id = 7
  AND status = 'free'
LIMIT 2
FOR UPDATE SKIP LOCKED;
-- 2 ids that no other transaction holds

UPDATE standing_places
SET status = 'sold', order_id = 503
WHERE id IN (...);

COMMIT;
```

If the query locks fewer than two rows, the purchase rolls back instead of selling one place. That does not mean the zone is sold out: other purchases may hold the rest for a moment. `SKIP LOCKED` sees only the rows that nobody is locking right now, so it fits taking any N of interchangeable rows, such as places or jobs in a queue. Numbered seats need exactly the chosen rows, and a count or a report must see every row.

::diagram{name="hot-row"}

Shopify found that [one row with a quantity per item could not handle the contention](https://shopify.engineering/scaling-inventory-reservations) of reservations, and in 2026 described its new design: a bounded pool of rows, one per sellable unit, claimed with `SELECT ... FOR UPDATE SKIP LOCKED` in the same MySQL database and transaction as the inventory ledger.

When the database still cannot keep up, the system limits how many buyers reach the purchase at once, for example with a waiting room at the entrance. <!-- link: patterns/rate-limiting -->

:::do
When many transactions write one row, split it into rows that writers can take independently, and claim "any N" with `SKIP LOCKED`. Write a hot row last and commit right after it.
:::

## Retrying a transaction

Several of the fixes so far end with the app running the transaction again. A retry done wrong sells a seat twice or overloads the database at the worst moment.

Retry only errors that mean "a conflict, try again": a serialization error, a deadlock, a lock timeout. An error that will repeat, such as a broken constraint or bad input, gets no retry; a seat that is already sold is an answer to show the buyer. Run the whole transaction again from `BEGIN`, reads included: the failed attempt made its decisions on data that has since changed, so retrying only the last statement would write a stale decision. The database cannot do this for the app, because the app's code between the statements decides what to write. Limit the attempts and wait a growing, random pause between them: under heavy contention, instant retries add to the load that caused the conflicts (more on [retries](../networking/#when-a-call-fails)).

The worst case is a lost answer. The app sends `COMMIT`, and the connection breaks before the reply comes. The transaction may have committed or not, and the app cannot tell. A blind retry may create a second order. The fix is an idempotency key: the client creates an ID for the purchase before the first attempt, and the transaction writes it, under a unique constraint, together with the order:

```sql
INSERT INTO orders (id, idempotency_key, buyer_id, event_id, total)
VALUES (501, 'b7e4c2d0', 42, 7, 180);
-- a retry of a committed purchase fails here on the unique key
```

The retry of a purchase that did commit fails on the key. The app rolls that attempt back, reads the existing order in a new transaction, and returns it. The key must stand for one request: a retry with the same key but other seats is an error, not the old order. The same key lets the buyer check the result of a purchase whose answer was lost.

::diagram{name="lost-commit"}

The payment provider is another system, and a rollback cannot take back a charge. So the purchase commits its own state first, an order waiting for payment, then calls the provider and passes it the same key, so a repeated call does not charge twice, if the provider supports such keys. The result goes into the database in a new transaction. A chain of steps across several systems, where each step must be undone when a later one fails, is a saga.

:::do
Retry only conflict errors, run the whole transaction again, and limit the attempts with a growing pause. Write an idempotency key in the same transaction as the change, so a retry after a lost answer does no harm.
:::

## Stores without transactions across records

The seat map now gets most of the traffic, and the team considers a key-value store or a document store that spreads data over many nodes. Many such stores have no transactions across several records, or only limited ones.

The guarantees so far have one name: **ACID**, for atomicity, consistency, isolation, and durability. In theory, the isolation in ACID is serializable, but many databases run at read committed by default, so "ACID" on a product page does not say which anomalies remain.

**BASE**, for "basically available, soft state, eventually consistent", names the opposite direction: a store that puts availability and scale first, lets its copies disagree for a while, and often has no transactions across records. It is a loose label, not a guarantee to check against. What happens between the copies belongs to replication.

Most such stores still make a write to one record atomic: a write to one row, document, or key applies fully or not at all. Such stores offer the tools of a single value: an increment and a conditional write, which is compare-and-set. So keep what must change together in [one record](../databases/#loading-a-record-in-one-read): an order with its seats in one document changes in one write. That makes the order atomic, but two orders can still take the same seat, so a rule across records, such as one owner per seat, still needs a conditional write on the seat's own record. A hold in a key-value store is a conditional write with an expiry.

Where such stores offer transactions across records, they come with limits: a cap on the number of records, a higher cost per write, and conflicts that may cancel a transaction instead of making it wait.

:::explain
If asked about ACID versus BASE, say that ACID names guarantees of transactions, and its isolation is often weaker than serializable by default. BASE names stores that put availability first, often with atomicity for one record only, and let copies disagree for a while. Then say which rule of the design needs more than one record and how you would guard it.
:::

## Cheat sheet

- Put changes that must happen together into one transaction: a commit applies all of them, a rollback none. Keep only database work inside, and run emails and other outside actions after the commit, from a record written in the same transaction.
- A transaction is committed once its commit record is flushed to the log. Recovery keeps such transactions and removes the rest. Durability holds only when the database says "ok" after that flush.
- Never read a value, change it in the app, and write it back unguarded. Compute the new value in one statement with the rule in `WHERE`, check how many rows changed, and use compare-and-set when only the app can compute the value.
- Read committed, the usual default, blocks dirty reads and dirty writes: writers lock rows until commit, and readers see the last committed version, or wait in a database without versions.
- Run reports and other multi-statement reads with snapshot isolation in a read-only transaction. MVCC keeps old versions so plain reads and writes do not block each other, and one long transaction holds back their cleanup.
- Put the check into the write when it fits one statement. Otherwise, lock rows on read when many transactions want them at once, and use a version check when conflicts are rare. Snapshot isolation stops the second of two concurrent writers of a row with a serialization error.
- Take locks one by one in a fixed order. The database breaks a deadlock by aborting one transaction, and the app rolls it back and retries it. A lock timeout caps waiting, and `NOWAIT` fails at once.
- Snapshot isolation and version checks do not stop write skew, and row locks do not stop phantoms. Guard a rule across rows with one row that every such transaction writes, or with a unique constraint when a sale inserts a row. Keeping the data within its rules is mostly the app's job.
- Serializable gives the result of some serial order, by serial execution, by two-phase locking (waits, deadlocks), or by SSI (aborts and retries). It covers only transactions that run at this level.
- Level names mean different things in different databases, so check the behavior. Use read committed with explicit guards by default, snapshot isolation for reports, and serializable when rules are many or complex and a retry is cheap.
- Never keep a transaction open while a user decides. Store a hold as a state with an expiry, set and check it in short transactions, and check it again in the final one. A version check fits when conflicts are rare.
- Writers of a hot row run one at a time. Write it last and commit right after; for more, split it into rows that writers take independently, and claim "any N" with `SKIP LOCKED`.
- Retry only conflict errors, run the whole transaction again, and limit the attempts with a growing pause. An idempotency key written in the same transaction makes a retry after a lost answer harmless. Commit local state before calling another system.
- ACID does not say which isolation level a database uses by default. Most stores without transactions across records still make one record atomic: keep what changes together in one record, and use conditional writes.

## Sources

- Jimmy Angelakos. [PostgreSQL Mistakes and How to Avoid Them](https://www.manning.com/books/postgresql-mistakes-and-how-to-avoid-them). Manning, 2025. Chapters 6 and 7.
- Martin Fowler. [Patterns of Enterprise Application Architecture](https://martinfowler.com/books/eaa.html). Addison-Wesley, 2003. Chapters 5 and 16.
- Martin Kleppmann, Chris Riccomini. [Designing Data-Intensive Applications](https://www.oreilly.com/library/view/designing-data-intensive-applications/9781098119058/), 2nd edition. O'Reilly, 2026. Chapter 8.
- Vlad Mihalcea. [High-Performance Java Persistence](https://vladmihalcea.com/books/high-performance-java-persistence/). 2016. Part II.
- Alex Petrov. [Database Internals](https://www.oreilly.com/library/view/database-internals/9781492040330/). O'Reilly, 2019. Chapter 5.
- Egor Rogov. [PostgreSQL 14 Internals](https://postgrespro.com/community/books/internals). Postgres Professional, 2023. Chapters 2–4, 13, and 14.
- Abraham Silberschatz, Henry F. Korth, S. Sudarshan. [Database System Concepts](https://www.db-book.com/), 7th edition. McGraw-Hill, 2020. Chapters 17 and 18.
- Zhiyong Tan. [Acing the System Design Interview](https://www.manning.com/books/acing-the-system-design-interview). Manning, 2024. Chapter 15.
- Alex Xu, Sahn Lam. [System Design Interview: An Insider's Guide, Volume 2](https://www.amazon.com/dp/1736049119). ByteByteGo, 2022. Chapter 7.
- Hal Berenson, Phil Bernstein, Jim Gray, Jim Melton, Elizabeth O'Neil, Patrick O'Neil. [A Critique of ANSI SQL Isolation Levels](https://arxiv.org/abs/cs/0701157). SIGMOD, 1995.
- Jepsen. [Snapshot Isolation](https://jepsen.io/consistency/models/snapshot-isolation).
- Brandur Leach. [Implementing Stripe-like Idempotency Keys in Postgres](https://brandur.org/idempotency-keys). 2017.
- MySQL. [Using SKIP LOCKED and NOWAIT to handle hot rows](https://dev.mysql.com/blog-archive/mysql-8-0-1-using-skip-locked-and-nowait-to-handle-hot-rows/). MySQL Server Blog, 2017.
- PostgreSQL. [Explicit Locking](https://www.postgresql.org/docs/current/explicit-locking.html) and [Serialization Failure Handling](https://www.postgresql.org/docs/current/mvcc-serialization-failure-handling.html). PostgreSQL documentation.
