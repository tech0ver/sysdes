---
title: PostgreSQL
description: How PostgreSQL works inside, what each of its features costs, and how far one PostgreSQL server goes before a design needs something else.
---

PostgreSQL is an open-source relational database with SQL, transactions, constraints, and extensions, and many systems keep their data, their rules, and often their queue, search, and cache in it. To defend it in a design, know what each feature costs on one server, what goes wrong as load grows, and which signs say that part of the work must move to another system.

## Serving many clients from one server

A home rental service, like Airbnb, starts on one PostgreSQL server. Hosts list homes, guests search and book, and a dozen app servers send queries to the database at the same time. To size this server and to know what breaks first, you need a picture of what runs inside it.

PostgreSQL is a group of processes on one machine. The **postmaster** process listens for connections and starts a separate operating system process, a **backend**, for each one. A backend serves one client connection until it closes. An error in a query aborts only that query's transaction, but all backends share the CPU, the disks, memory, and locks, so one heavy query still slows the others. Each connection costs a whole process, and opening one is slow compared with a short query. So app servers keep connections open in a connection pool, and the number of connections becomes a limit of its own (more on [many connections](#serving-thousands-of-app-connections)).

Backends also share memory. If the operating system kills one of them, for example when memory runs out, the postmaster can no longer trust that shared memory: it ends every backend and recovers the database from its log. One failed process interrupts all clients for a while.

The largest part of that shared memory is **shared buffers**: a cache of 8 KB pages of tables and indexes. A backend reads a page from shared buffers or loads it from a data file. A change goes to the page in memory, and the page is written back to the file later. PostgreSQL reads its files through the operating system, so a page can also sit in the OS page cache. A miss in shared buffers is not always a disk read, and a hot page can take memory twice.

::diagram{name="page-lookup"}

The default size of shared buffers is 128 MB, so that PostgreSQL starts on a small machine shared with other programs. On a dedicated server, start at about a quarter of RAM and leave the rest to the OS cache and to the memory that queries take for sorts and hashes. More memory helps only while the data that queries touch most does not yet fit. In load tests on a 16 GB server, raising `shared_buffers` from 3 GB to 12 GB and `work_mem` from 128 MB to 2 GB gave no more throughput. `work_mem` is the base memory budget of each sort or hash step in each query (more on [query memory](#finding-why-a-query-is-slow)), and with 1,000 clients the larger settings made the server run out of memory ([Angelakos](https://www.manning.com/books/postgresql-mistakes-and-how-to-avoid-them)).

Background processes do the rest of the work:

- The WAL writer and the checkpointer flush the log of changes and write changed pages to the data files.
- The background writer writes changed pages ahead of time, so a backend rarely has to write one before it can load another.
- Autovacuum workers clean up old versions of rows and refresh the statistics that the query planner uses (more on [vacuuming](#dead-rows-pile-up)).
- WAL senders stream the log to **standbys**, copies of the server that serve reads and can take over, and the archiver copies it to backup storage (more on [standbys](#copies-on-other-servers)). The server that takes writes is the **primary**.

::diagram{name="pg-instance"}

One postmaster with its memory and data directory is an **instance**; PostgreSQL itself calls it a database cluster, even though it runs on one machine. An instance can hold several databases, but they share memory, processes, and one log of changes. A heavy database slows down its neighbors, and standbys and physical backups always copy the whole instance.

:::explain
Say that every write goes to one PostgreSQL server, so plan its CPU, memory, and disk for the peak write load. Put a connection pool between the app servers and the database, and size memory so that the data most queries read fits in RAM.
:::

## Deciding when a commit is durable

A guest pays for a booking, and the app shows "Booked" as soon as `COMMIT` returns. If the server loses power a second later, the booking must still be there after the restart, although the shared buffers are gone.

PostgreSQL keeps this promise with the WAL. A backend that changes a page in shared buffers also appends a record of the change to the WAL. At `COMMIT`, it waits until the WAL up to its commit record is flushed to disk with `fsync`. The changed data pages stay in memory and reach the data files later. The WAL is written in order, and one flush can carry the commits of many transactions that wait at the same moment. So a commit waits for a sequential write of the log, not for a write of every page it changed. After a crash, PostgreSQL replays the WAL and redoes the changes that had not reached the data files.

::diagram{name="commit-flush"}

Replay starts from the last completed checkpoint. A checkpoint writes all pages changed before its start to the data files; once it completes, the WAL before its start is no longer needed for crash recovery and can be reused. A checkpoint starts every 5 minutes (`checkpoint_timeout`) or when the WAL grows toward its size target (`max_wal_size`, 1 GB by default), whichever comes first, and spreads its writes over most of the interval ([PostgreSQL](https://www.postgresql.org/docs/18/wal-configuration.html)). Rare checkpoints write each busy page fewer times and create less WAL, but recovery after a crash replays more of it. When the logs show that most checkpoints are triggered by WAL volume rather than by time, raise `max_wal_size`. It is a target, not a limit: standbys and backups that still need old WAL keep it on disk longer (more on [replication slots](#copies-on-other-servers)).

::diagram{name="checkpoint-replay"}

A page is 8 KB, but a disk writes in smaller blocks, often 4 KB. A crash in the middle of a page write can leave a **torn page**, half old and half new, and a WAL record cannot repair a page it cannot read. So the first change to a page after each checkpoint puts a copy of the whole page into the WAL. These copies can be most of the WAL: 72% of it in one pgbench run in Rogov's book, so measure their share in your own workload ([Rogov](https://postgrespro.com/community/books/internals)). Rarer checkpoints mean fewer copies, and WAL compression (`wal_compression`, LZ4 or Zstandard since PostgreSQL 15) makes them smaller at the cost of CPU.

::diagram{name="full-page-writes"}

Some data can afford to lose its last second of commits. With **asynchronous commit** (`synchronous_commit = off`), `COMMIT` returns before the flush, and the WAL writer flushes within three times `wal_writer_delay`, 0.6 seconds by default. A crash loses the transactions acknowledged in that window, and the database stays consistent, as if they had rolled back. In one pgbench run, a single client with short transactions went from 671 to 2,060 transactions per second ([Rogov](https://postgrespro.com/community/books/internals)). Set it for one transaction or one session: view counters and activity logs can use it, bookings and payments cannot.

::diagram{name="async-commit"}

:::distinguish
`synchronous_commit = off` can lose the last fraction of a second of acknowledged commits and nothing more. `fsync = off` and `full_page_writes = off` let a crash leave pages broken, so the whole instance may need a restore from backup. Keep both on for any data you keep.
:::

A flush is only as safe as the disk under it. A drive or controller with a write cache that loses its contents on power loss can report a write as done before it is on disk. Use storage that keeps flushed data through a power loss, and check the flush speed with `pg_test_fsync`.

Corruption can also come from a bad disk or bad memory. **Data checksums** store a checksum in every page and detect a damaged page when it is read, instead of returning wrong data. New instances get them by default since PostgreSQL 18 ([PostgreSQL](https://www.postgresql.org/docs/18/app-initdb.html)); an older instance needs `pg_checksums`, run while the server is stopped.

<!-- demo: pgbench with synchronous_commit on and off; kill -9 the server and watch crash recovery replay the WAL (a process crash keeps the OS cache, so it does not show a power loss). -->

:::do
Keep the defaults that protect data: `synchronous_commit`, `fsync`, and `full_page_writes` on, and data checksums on. Turn off `synchronous_commit` only for transactions whose last second you can lose.
:::

## Keeping data valid inside the database

Two guests try to book the same home: one for 12–15 May, the other for 14–16 May. Two app servers check the calendar at the same moment, both see free dates, and both insert a booking. The check and the insert are separate steps, so a check in the app cannot stop this (more on [rules across several rows](../../fundamentals/transactions/#a-rule-across-several-rows)).

PostgreSQL can hold the rule itself. A **range type** such as `daterange` stores a period as one value, and an **exclusion constraint** rejects a row that conflicts with an existing one under the operators you list. Here the rule is "the same home and overlapping dates":

```sql
CREATE EXTENSION btree_gist;

CREATE TABLE bookings (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  home_id bigint NOT NULL REFERENCES homes (id),
  stay daterange NOT NULL,
  status text NOT NULL DEFAULT 'confirmed',
  EXCLUDE USING gist (home_id WITH =, stay WITH &&)
);
```

The example assumes each stay has both days and is not empty; a `CHECK (NOT isempty(stay) AND NOT lower_inf(stay) AND NOT upper_inf(stay))` makes that a rule too. The second insert fails with a conflict error, and the app tells that guest the dates are taken. A `daterange` built from the check-in and check-out days includes the first and excludes the last, so a check-out day stays free for the next check-in. To let cancelled bookings free their dates, add `WHERE (status <> 'cancelled')` to the constraint; `status` is `NOT NULL`, because a row with no status would skip the check. PostgreSQL enforces the constraint through a GiST index, which each covered insert updates. It cannot enforce the rule across separate databases: once bookings are split across several of them, the app needs its own way to keep the rule. How to build a whole booking flow with holds and expiry is [a separate pattern](../../patterns/reservations/).

::diagram{name="booking-overlap"}

Simpler rules work the same way, and every writer obeys them: the app, a script, and a hand-run migration. `NOT NULL`, `CHECK (price > 0)`, `UNIQUE`, and foreign keys cover most of them. A unique index with a `WHERE` clause makes values unique among some rows only, such as one active listing per address. A foreign key does not create an index on the column that refers to the parent. Without one, deleting a host or joining homes to their host scans the whole table, so index the foreign key columns you join or delete on.

Types are rules too. Pick them by what the value means:

| Value | Type | Avoid |
| --- | --- | --- |
| A moment, such as when a booking was paid | `timestamptz` | `timestamp`, which stores clock digits without a time zone and gets durations wrong across daylight saving changes |
| A day or a period of days | `date`, `daterange` | Two timestamps that the app must keep in order |
| Money | `numeric`, with the currency in its own column | `float`, which rounds, and `money`, which takes its currency from a server setting |
| Text with a length rule | `text` with a `CHECK` | `varchar(n)` with a guessed limit; `char(n)`, which pads with spaces |
| A record ID | `bigint` identity | `int`, which runs out at about 2.1 billion |

An identity column takes numbers from a **sequence**. A sequence hands out numbers to concurrent transactions without waiting, and a rollback does not return a number, so gaps are normal: do not use it for invoice numbers that must have no gaps. A sequence can also be reset by hand, so keep the primary key that makes the IDs unique. A random UUID (version 4) lets any server create an ID without asking the database, but its index lands every new key on a random page. PostgreSQL 18 adds [`uuidv7()`](https://www.postgresql.org/docs/18/functions-uuid.html), which starts with a timestamp, so new keys usually land near the end of the index, much like numbers do (more on [time-ordered IDs](../../patterns/unique-ids/#time-ordered-ids-without-node-numbers)). In a PostgreSQL 18 test, adding 50 million rows to a table that already held 50 million took 46 minutes with UUIDv4 keys and 1 minute 40 seconds with UUIDv7, and the UUIDv4 index came out about 30% larger ([Machytka](https://www.credativ.de/en/blog/postgresql-en/a-deeper-look-at-old-uuidv4-vs-new-uuidv7-in-postgresql-18/)).

::diagram{name="uuid-inserts"}

Access rules can live in the database as well: roles limit what each app may touch, and row-level security hides other tenants' rows even when a query forgets to filter them. <!-- link: fundamentals/security -->

:::do
Put the rules that must hold for all writers into the table definitions wherever PostgreSQL can express them: types, `NOT NULL`, `CHECK`, unique and foreign keys, and exclusion constraints for overlaps. Hold the remaining rules across rows with transactions and locks, and keep in the app only the rules that need data from outside the database.
:::

## Storing attributes that differ per record

A house has a pool and parking, an apartment has a floor and an elevator, and a boat has berths. Hosts fill in dozens of such fields, and new ones appear every month. A column for each would leave most of them empty, and every new field would need a schema change (more on [records with different fields](../../fundamentals/databases/#records-with-different-fields)).

**JSONB** stores a JSON document in a column in a parsed binary form, so PostgreSQL can query and index the fields inside it. The plain `json` type keeps the original text and parses it on every read; pick it only when the exact text matters. Most designs mix typed columns and JSONB: columns for what queries filter, join, sort, and constrain (price, number of guests, city), and one JSONB column for the long tail of attributes.

```sql
SELECT id, title
FROM homes
WHERE city = 'Lisbon'
  AND attrs @> '{"pool": true}';
-- 1042 | Villa with a pool in Belém
-- 2210 | Townhouse with a garden pool
```

Two kinds of index fit JSONB:

- A **GIN** index on the whole column indexes every key and value at any depth. It serves containment (`@>`), key tests (`?`), and JSONPath matches (`@?`, `@@`) on the whole document. It is large and slows down writes. Its `jsonb_path_ops` variant is smaller and serves containment and JSONPath, but not key tests.
- A B-tree index on one expression, such as `(attrs->>'floor')`, serves that one key, like a normal column. On 2.4 million documents, a GIN index over whole documents took 1,680 MB, while a B-tree on one extracted key took 61 MB ([Angelakos](https://www.manning.com/books/postgresql-mistakes-and-how-to-avoid-them)).

::diagram{name="jsonb-indexes"}

JSONB has costs that columns do not. The planner keeps no statistics about keys inside a document, so it guesses how many rows a JSONB filter returns. For a key that matters, an expression index or `CREATE STATISTICS` on the expression (PostgreSQL 14) gives it statistics. Changing one key writes a new copy of the whole row, and a large document is also compressed and stored apart from the row. PostgreSQL checks that a document is valid JSON, but types and foreign keys only for columns, so a typo in a key or a string where a number belongs reaches the data unless a `CHECK` catches it.

When a key starts to matter, a **generated column** turns it into a real column. PostgreSQL computes its value from other columns of the same row, and with `STORED` it does so on every insert and update and keeps the result like any other column. The app keeps writing the document, and the column gets a type, constraints, indexes, and statistics. A floor that is not a number now fails the write, so the column also checks the document:

```sql
ALTER TABLE homes
ADD COLUMN floor int
GENERATED ALWAYS AS ((attrs->>'floor')::int) STORED;
```

Adding a stored generated column rewrites the table under a lock (more on [schema changes under load](#changing-the-schema-under-load)).

:::do
Keep the core fields as typed columns and the rare, varied ones in JSONB. When a key appears in most queries or needs a rule, move it into a column, for example a generated column that fills it from the document.
:::

## Storing rows and pointing to them

As the service grows, hosts publish thousands of homes a day and edit them often. How fast that goes depends on how PostgreSQL lays rows out on disk.

A table is a **heap**: a file of 8 KB pages with rows in no particular order. A new row goes to any page with enough free space. Each row carries a header of at least 23 bytes that records which transactions see it. In a table of a few narrow columns, headers and padding take much of the space. Column order matters a little: values are aligned in memory, and placing wide fixed-size columns first can save padding bytes in every row.

The address of a row is its **TID**: the page number and the slot on that page. A TID changes when the row is updated, so it is never an ID for the app. Every B-tree index, the primary key included, maps its keys to TIDs; a BRIN index is the exception, it only summarizes ranges of pages. MySQL's InnoDB works the other way: the table itself is a tree ordered by the primary key, and other indexes store the primary key (more on [indexes on other columns](../../fundamentals/storage-engines/#searching-by-other-columns)). In PostgreSQL, a lookup by any index takes one step from the index to the row. But PostgreSQL writes every update as a new version of the row, usually in a new place, and then every applicable B-tree index needs a new entry for it, unless the update is a [HOT update](#an-update-writes-a-new-row).

::diagram{name="heap-vs-clustered"}

Rows are not kept in the order of any key. Reading the bookings of one home by an index can visit almost one page per booking, scattered over the table. In one test, fetching 9,999 rows stored in order touched 85 pages, while the same rows spread at random touched about 8,000 ([Schönig](https://www.packtpub.com/en-us/product/mastering-postgresql-17-9781836205968)). `CLUSTER` sorts a table by an index once, under a lock that blocks all access, and does not keep the order for new rows.

::diagram{name="row-order"}

A row must fit in a page, so long values go elsewhere. When a row is wider than about 2 KB, **TOAST** compresses its long values and, if that is not enough, moves them in chunks to a separate table. A query that does not ask for a moved value never reads it, so select only the columns you need instead of `SELECT *`. PostgreSQL 14 added LZ4 compression as an option next to the default; compare the two on your data. One value can hold up to 1 GB, and one table up to 32 TB with the default page size; a partitioned table can hold more ([PostgreSQL](https://www.postgresql.org/docs/18/limits.html)).

::diagram{name="toast"}

:::avoid
Do not index long text, such as a home description, with a B-tree. An entry must fit in about a third of a page, so a long value fails to insert. Search such text with a [full-text index](#searching-by-words).
:::

## Choosing an index for a query

Guests search for homes in a city for four people and sort them by price. Hosts open their bookings for the next month. Support looks up a booking by its code. With millions of rows, each of these queries needs an index, and the right one depends on how the query compares values.

PostgreSQL picks an index by the operator in the query, not by the column. It has several kinds of index, each for its own operators:

| Index | Answers | In the rental service |
| --- | --- | --- |
| B-tree, the default | `=`, `<`, `>`, `BETWEEN`, `ORDER BY`, a text prefix (with `text_pattern_ops` under most locales) | Price ranges, dates, IDs, sorting |
| Hash | `=` only | Rarely worth it over a B-tree |
| GIN | "contains": a key in a document, an element in an array, a word in a text | JSONB attributes, search by words |
| GiST | "overlaps" and "near": ranges, shapes, distances | Booking periods, homes near a point |
| SP-GiST | Points and prefixes in a space split into parts | Phone or IP prefixes, points on a map |
| BRIN | A summary of each range of pages, 128 pages (1 MB) by default | A huge log table written in time order |

A B-tree serves most queries. A composite index over several columns is sorted by the first column, then by the second inside it, so the order of its columns decides which queries it reads efficiently. For an index on `(city, price)`:

- `WHERE city = 'Lisbon'` uses it: the city is the first column.
- `WHERE city = 'Lisbon' AND price < 100` uses both columns. The order of the conditions in `WHERE` does not matter, only the order of the columns in the index.
- `WHERE city = 'Lisbon' ORDER BY price` reads the homes of the city already sorted by price, with no sort step.
- `WHERE price < 100` gets little help. The prices are spread across all cities, so PostgreSQL would have to read most of the index, which rarely beats reading the table. PostgreSQL 18 can skip from one city to the next inside the index, which pays off when the first column has few distinct values.
- `WHERE city > 'L' AND price < 100` uses the range on the city to find where to start, then checks the price of the entries in that range inside the index.

::diagram{name="composite-index"}

One composite index can make another redundant: `(city, price)` also serves the queries of a non-unique index on `city` alone. The shorter index is smaller, though, so check its use and the plans before you drop it. To serve queries by `city` alone and by `price` alone, you need two indexes: `(city, price)` and `(price)`. Two single-column indexes also work for a query on both columns, because PostgreSQL can combine their matches with a bitmap scan; a composite index is usually faster for a frequent combination.

Three variants make an index smaller or fit a query better:

- A **partial index** (`WHERE status = 'active'`) covers only the rows the queries look for, so it is smaller and cheaper to update. The planner uses it only when it can prove from the query's conditions that the rows match, so write the same condition in the query, not a parameter in its place.
- An **expression index** (`lower(email)`) stores the result of a function. A query uses it only when it has the same expression. A function over an indexed column, such as `created_at::date = '2026-05-12'`, cannot use a plain index, and this cast depends on the session's time zone, so it cannot be indexed as written either. A range such as `created_at >= '2026-05-12' AND created_at < '2026-05-13'` can use the index; pick the time zone of the day boundaries on purpose.
- A covering index adds columns that the query only returns (`INCLUDE (title)`), so an **index-only scan** can answer without reading the table. It still checks a visibility map to know which pages hold only rows that every transaction sees; for other pages it reads the table after all. [Vacuuming](#dead-rows-pile-up) keeps that map current.

::diagram{name="index-only-scan"}

An index pays off when a frequent query needs a small share of the rows. When a query matches a large share, reading the table pages in order is usually cheaper than jumping between the index and the table, and the planner prefers that, unless the index also gives the order for a `LIMIT` or answers the query alone. Look at how many rows the queried value matches, not at how many distinct values the column has: a column with few values can still have a rare value worth an index. A `status` column has three values, and 99% of homes are `active`. An index on it does not help a query that reads the active homes, but the moderation queue asks for the few homes `pending` review, and for that value an index finds them at once. The planner knows the difference: its statistics keep the most common values of each column with their shares, so it reads the index for `pending` and the table for `active`. A partial index fits such a case best: `ON homes (created_at) WHERE status = 'pending'` holds only the rare rows, stays tiny, and changes only when a row enters, changes in, or leaves that set.

Every index has a price. Each insert updates every index of the table (a partial index only for the rows it covers), and an update that is not HOT adds an entry to every applicable index that points to rows, even when the indexed values did not change (more on [what an update writes](#an-update-writes-a-new-row)). Indexes also take disk space and memory, and add work to vacuuming, backups, and the planner. Look for indexes that queries never use in `pg_stat_user_indexes` (`idx_scan = 0`) over a long enough period. Before you drop one, check that it does not enforce uniqueness and that queries on the standbys do not use it, because each server counts its own scans.

Building an index on a live table blocks writes to it until the build ends. `CREATE INDEX CONCURRENTLY` lets writes go on, but it scans the table twice, takes longer, cannot run inside a transaction, and leaves an invalid index behind if it fails, which you drop and build again (more on [schema changes under load](#changing-the-schema-under-load)).

<!-- demo: the same queries with no index, a B-tree, a composite, a partial, and a covering index; compare EXPLAIN (ANALYZE, BUFFERS). -->

:::explain
Given an index on `(a, b)`, say which queries use it well: a filter on `a`, on `a` and `b` in any order of conditions, and on `a` sorted by `b`. A filter on `b` alone has to read most of the index, unless `a` has few values and the database can skip through them. Put first the column that most queries filter by with `=`.
:::

:::do
Start with B-tree indexes on the columns that frequent queries filter, join, and sort by, equality columns first; index foreign keys you join on. Reach for GIN, GiST, or BRIN when the operator needs it, and confirm each index with `EXPLAIN` before you keep it.
:::

## Finding why a query is slow

The search page slows down as the number of listings grows. Before you add an index or a bigger server, find which query costs the most and why.

Start with the totals. The **pg_stat_statements** extension groups queries that differ only in their parameters and counts the calls, the total time, and the pages read of each group. Sort by total time, not by the slowest single run: a 2 ms query called 5,000 times per second costs more than a 3-second report run once an hour. `log_min_duration_statement` writes slow statements to the log, and the `auto_explain` extension also writes their plans, so you can see the plan of a run that is hard to reproduce.

The **query planner** picks the plan with the lowest estimated cost. It estimates how many rows each step returns from statistics that `ANALYZE` collects from a sample of each table: the most common values, a histogram of the rest, and the number of distinct values. From those estimates it picks how to read each table: a full scan, an index scan, an index-only scan, or a bitmap scan. A bitmap scan collects the matches from indexes first and then reads their pages in page order. The planner also picks how to join the tables:

- A **nested loop** runs the inner side once for each row of the outer side. It works well when the outer side is small and the inner side is an index lookup.
- A **hash join** builds a hash table from one input in memory and probes it with the other. It suits large inputs joined by equality.
- A **merge join** walks two inputs sorted by the join key. It suits inputs that already come sorted, for example from indexes.

::diagram{name="join-methods"}

`EXPLAIN` shows the chosen plan, and `EXPLAIN (ANALYZE, BUFFERS)` runs the query and adds the real row counts, times, and pages read for each step. Costs are planner units, not milliseconds. A step that runs many times, such as the inner side of a nested loop, shows `loops`: its rows and time are per run, so multiply them by `loops`. Look for the first step where the estimated rows differ from the real ones by orders of magnitude: a wrong estimate there can make the steps above it bad choices. `BUFFERS` splits pages found in shared buffers from pages read from files, which may still come from the OS cache. A query can also be slow without a bad plan: it may wait for a lock, which `pg_stat_activity` shows as its wait event, with the blocking sessions from `pg_blocking_pids()`. `ANALYZE` in `EXPLAIN` really runs the statement, so wrap an `UPDATE` or `DELETE` in a transaction you roll back.

::diagram{name="explain-plan"}

The usual causes and fixes:

- Stale statistics after a bulk load or a large delete: run `ANALYZE` on the table.
- Columns that depend on each other, such as city and country: the planner multiplies their selectivities as if they were independent and underestimates rows. `CREATE STATISTICS` teaches it the link.
- A function over an indexed column, as in the expression index above: rewrite the condition, or index the expression when it does not depend on settings such as the time zone. On an airline sample database, replacing a cast to `date` with a time range cut a query from 1.5 s to 0.5 s ([Dombrovskaya et al.](https://link.springer.com/book/10.1007/979-8-8688-0069-6)).
- One query, different values: a city with ten homes and a city with a million need different plans. After five runs, a prepared statement may switch to one generic plan that fits neither; `plan_cache_mode` changes that.
- A sort that does not fit `work_mem` (4 MB by default) spills to temporary files; a hash may use twice that (`hash_mem_multiplier`). The limit applies to each step of each query and each parallel worker, so the total grows with the number of steps and sessions. Raise it for the session of the report that needs it, not for the whole server ([PostgreSQL](https://www.postgresql.org/docs/18/runtime-config-resource.html)).

::diagram{name="work-mem-total"}

- Deep pages with `OFFSET`: the server reads and throws away every skipped row. On 10 million rows, `OFFSET 5000000 LIMIT 50` read 117,289 pages, while a condition on the last seen key (`WHERE id > $1 ORDER BY id LIMIT 50`) read 2 ([Atkinson](https://pragprog.com/titles/aapsql/high-performance-postgresql-for-rails/)).

::diagram{name="offset-vs-keyset"}

- Many small queries instead of one: an ORM that loads a list and then each item separately (the N+1 pattern) multiplies network round trips. In one legacy app, a form issued about 16,000 queries and took 5–7 minutes; one query that returned the same data took under 200 ms ([Dombrovskaya et al.](https://link.springer.com/book/10.1007/979-8-8688-0069-6)).
- A join of many tables generated by an ORM: at OpenAI, bursts of one 12-table join caused severe incidents, and the fix was to split it and move part of the work into the app ([OpenAI, 2026](https://openai.com/index/scaling-postgresql/)).

Core PostgreSQL has no hints that force a plan. Fix the statistics, the indexes, or the query; the `pg_hint_plan` extension adds hints, but a forced plan stops adapting when the data changes.

<!-- demo: a slow search query; find it in pg_stat_statements, read EXPLAIN (ANALYZE, BUFFERS), fix the estimate, compare. -->

:::do
Rank queries by total time in `pg_stat_statements`. For the top ones, check first whether they wait for locks, then read the plan with `EXPLAIN (ANALYZE, BUFFERS)` and fix the earliest real cause: a wrong row estimate, a missing index, a spill, or too much data read. Count the queries per page as well as their speed.
:::

## Serving thousands of app connections

The service now runs 40 app servers with 20 connections each, plus background workers: more than 800 connections, while `max_connections` is 100 by default. Raising the limit to 1,000 makes the server accept them, but it does not make it faster.

Memory is a smaller problem than it seems: in 2020 tests with huge pages, the base cost of a connection was under 2 MB, though caches and query memory add to it ([Freund](https://techcommunity.microsoft.com/blog/adforpostgresql/analyzing-the-limits-of-connection-scalability-in-postgres/1757266)). The same tests found a bigger cost: every query takes a snapshot of the transactions running at that moment, and building it took longer with every open connection, so one active connection ran at less than half its speed next to 5,000 idle ones. PostgreSQL 14 made snapshots much cheaper. The limit that remains is active work: past some number of active connections, close to the number of cores for queries that mostly use the CPU, throughput stops growing while latency keeps rising. In a pgbench test, 32 clients got 572 transactions per second at 56 ms each, and 2,000 clients got 352 at 5.5 seconds each ([Angelakos](https://www.manning.com/books/postgresql-mistakes-and-how-to-avoid-them)).

Opening a connection is slow too: a new process, authentication, and often TLS. OpenAI measured 50 ms to open a connection directly and 5 ms through a pool ([OpenAI, 2026](https://openai.com/index/scaling-postgresql/)).

A **connection pooler**, such as PgBouncer, sits between the apps and the database. Apps open as many connections to it as they like, and it passes their work to a small set of server connections. In **transaction mode**, the usual choice, a client gets a server connection only for the length of one transaction, so a few dozen server connections can serve thousands of clients. The price is that nothing may outlive a transaction on a connection: `SET` for the session, session advisory locks, `LISTEN`, temporary tables kept across transactions, SQL `PREPARE`, and cursors kept open break. `SET LOCAL` and temporary tables with `ON COMMIT DROP` work, because they end with the transaction. Prepared statements of the client protocol work since PgBouncer 1.21 with `max_prepared_statements` set ([PgBouncer](https://www.pgbouncer.org/features.html)). Session mode keeps all features but holds a server connection for as long as the client stays connected, so it cannot share connections among clients that stay connected at the same time.

::diagram{name="transaction-mode"}

Size the pools from the server side. App pools add up: 40 servers × 20 connections is 800, before any workers. Start with a few server connections per CPU core, raise the number while throughput still grows, let the pooler queue the rest, and keep the pooler's total below `max_connections`, with room for admins. At Notion, about 100 PgBouncer instances could each open 6 connections to every database server, 600 connections per server. Before tripling the number of servers, Notion split its poolers into groups, each serving fewer servers ([Notion, 2023](https://www.notion.com/blog/the-great-re-shard)). At Railway in 2025, PgBouncer allowed more connections than PostgreSQL did, so a blocked table used up every slot, and engineers could not log in to cancel the blocking command ([Railway, 2025](https://blog.railway.com/p/incident-report-oct-28th-2025)).

::diagram{name="pooler"}

Timeouts keep one bad client from holding connections forever: `statement_timeout` for long queries, `idle_in_transaction_session_timeout` for a transaction that an app forgot to finish, and `lock_timeout` for waits on locks. All are off by default; set them for each app's database role. Close idle connections in the pooler rather than with `idle_session_timeout` (PostgreSQL 14) on the server, since a pooler may not expect its connections to disappear.

<!-- demo: pgbench with 50, 500, and 2,000 clients, directly and through PgBouncer in transaction mode; compare throughput and latency. -->

:::explain
Draw the app servers, then PgBouncer in transaction mode, then PostgreSQL. Say that a few dozen server connections serve thousands of clients, and that session features such as `SET` or session advisory locks do not work through it.
:::

## An update writes a new row

Every time a guest opens a listing, the app runs `UPDATE homes SET views = views + 1`, and hosts change prices every day. The `homes` table has eight indexes, and none of them is on `views`. Yet each of these updates can write to all eight.

PostgreSQL implements MVCC inside the table itself. It never changes a row in place: an `UPDATE` marks the current version as ended by its transaction and writes a full new version of the row, with all columns, into the heap. A `DELETE` only marks the version as ended. Each version records the transaction that created it and the one that ended it, and a snapshot uses these marks to decide which version it sees. A rollback is cheap, because it only marks the transaction as aborted; its versions stay in the table until they are cleaned up.

The new version gets a new TID, and B-tree indexes point to TIDs, so each of them needs a new entry, even an index whose columns did not change. Uber described this in 2016: in a table with a dozen indexes, an update of one indexed field wrote to all twelve, all of it went into the WAL, and the WAL stream to standbys in another data center grew with it. That was one of the reasons Uber moved to MySQL, whose secondary indexes point to the primary key ([Uber, 2016](https://www.uber.com/blog/postgres-to-mysql-migration/)). In 2026, OpenAI still named this write amplification as its main limit for heavy writes on PostgreSQL ([OpenAI, 2026](https://openai.com/index/scaling-postgresql/)).

A **HOT update** (heap-only tuple) avoids the index writes. When the new version fits on the same page and no column used by a B-tree or another index that points to rows changes, PostgreSQL chains it to the old one inside the page. Since PostgreSQL 16, a change to a column with only a BRIN index on it does not prevent this; the BRIN summary may still need an update ([PostgreSQL](https://www.postgresql.org/docs/18/storage-hot.html)). The indexes keep pointing to the first version and follow the chain, and later reads clean up old versions on the page without waiting for vacuuming. Two things keep updates HOT:

- Leave room on each page. A table's `fillfactor` (100% by default) sets how full inserts may fill a page; `fillfactor = 80` keeps a fifth of each page free for new versions, at the price of a larger table.
- Do not index columns that change often. One index on `views` would turn every view into nine index writes again.

::diagram{name="hot-update"}

Check the result in `pg_stat_user_tables`: `n_tup_hot_upd` against `n_tup_upd` shows the share of HOT updates, and since PostgreSQL 16, `n_tup_newpage_upd` counts the updates that did not fit on their page.

The counter also makes writes wait for each other. Each page view of a popular home updates the same row and waits for the row lock of the previous update (more on [contention on one row](../../fundamentals/transactions/#contention-on-one-row)). A new version of a wide row also copies all its columns except long values stored apart. Move such hot, small fields into a narrow table of their own, or count views elsewhere and write the totals in batches (more on [counters inside PostgreSQL](#caches-counters-and-time-series-inside-postgresql)).

The old versions stay behind until something removes them.

<!-- demo: update a counter with and without an index on it and with fillfactor 100 and 80; compare n_tup_hot_upd, table size, and WAL volume. -->

:::do
Keep frequently updated columns out of indexes, leave free space on pages of tables with many updates (`fillfactor` 80–90), and watch the share of HOT updates. Move counters and timestamps that change on every request out of wide rows.
:::

## Dead rows pile up

After a month, the `homes` table takes three times the space of its live rows, and queries read more pages for the same results. The old versions are still there.

**VACUUM** removes them. It finds versions that no running transaction can still see, deletes the index entries that point to them, and marks their space free for new rows. It runs next to normal reads and writes. But it rarely returns space to the operating system: it can cut off only empty pages at the end of the file, and for that moment it needs a lock that blocks the table. A table keeps the size it once grew to, with free space inside. This extra space, **bloat**, is normal in moderate amounts; it becomes a problem when it keeps growing.

**Autovacuum** runs vacuuming for you. About once a minute it looks at each database, and up to three workers vacuum the tables that need it. A table qualifies once its dead rows exceed 50 plus 20% of its rows; PostgreSQL 18 also caps the threshold at 100 million rows. For a table of 100 million rows, that still means 20 million dead rows before cleanup starts, so lower the share for large and busy tables, for example to 1% with `autovacuum_vacuum_scale_factor = 0.01` on that table. Autovacuum is also throttled: after a set amount of work it sleeps for 2 ms, and that budget is shared by all workers, so more workers split the same budget. On fast disks, raise the budget (`autovacuum_vacuum_cost_limit`, which takes the default of 200 from `vacuum_cost_limit`) toward 2,000 and watch the disk load ([Atkinson](https://pragprog.com/titles/aapsql/high-performance-postgresql-for-rails/); [PostgreSQL](https://www.postgresql.org/docs/18/runtime-config-vacuum.html)). Since PostgreSQL 13, tables that only get inserts are vacuumed as well; this keeps their visibility map current for index-only scans.

Vacuuming can remove only versions that the oldest snapshot still in use cannot see, in any table of the database. So one old snapshot or one old transaction that has written something keeps the newer dead rows everywhere: a report that runs for hours, a transaction the app opened and never closed (`idle in transaction`), a forgotten prepared transaction, a standby that asks the primary to keep versions for its queries, or a [replication slot](#copies-on-other-servers) whose stopped consumer still holds an old horizon (`xmin` in `pg_replication_slots`). In a test of a job queue table, one long transaction let the queue grow to 60,000 waiting jobs within an hour, because each worker searched through thousands of dead job rows to find a live one ([Brandur, 2015](https://brandur.org/postgres-queues)). Find such sessions by `xact_start`, `backend_xid`, and `backend_xmin` in `pg_stat_activity`, and cap them with `idle_in_transaction_session_timeout` and, since PostgreSQL 17, `transaction_timeout`.

::diagram{name="vacuum-horizon"}

When a table is already bloated, a normal `VACUUM` will not shrink it. `VACUUM FULL` rewrites the table into a new file, but it holds an exclusive lock for the whole rewrite and needs free disk space for the new copy. The pg_repack and pg_squeeze extensions rebuild a table while it stays in use and take a strong lock only for a short moment at the end. Indexes bloat too: after many changes, B-tree pages can stay half empty. New keys that belong on such a page reuse its space, and fully empty pages are recycled, but PostgreSQL does not merge half-empty neighbors. Rebuild a bloated index with `REINDEX CONCURRENTLY` (PostgreSQL 12).

::diagram{name="vacuum-vs-full"}

<!-- demo: open a repeatable read transaction, read one row, and leave it idle; run updates; watch n_dead_tup grow and VACUUM VERBOSE report rows that cannot be removed yet; close it and vacuum again. -->

:::do
Keep autovacuum on and tune it per table for large, busy tables. Alert on transactions older than a few minutes, set `idle_in_transaction_session_timeout`, and run long reports on a standby built for them rather than on the primary.
:::

## Running out of transaction IDs

Vacuuming has one more job, and this one cannot be put off. Each transaction that writes gets a **transaction ID** (XID), and every row version stores the XIDs that created and ended it. XIDs are 32-bit numbers that wrap around, so PostgreSQL compares them on a circle: about 2 billion IDs behind the current one count as the past, and the rest as the future. Ordinary read-only transactions do not take XIDs. A row whose XID falls more than 2 billion behind would seem to come from the future and disappear from every query. At 1,000 writing transactions per second, 2 billion IDs last about 23 days.

::diagram{name="xid-circle"}

To prevent this, vacuuming **freezes** old rows: it marks them as visible to every transaction, so their XID no longer matters and the number can be used again. Freezing runs as part of normal vacuuming. When the oldest unfrozen XID of a table falls 200 million behind (`autovacuum_freeze_max_age`), PostgreSQL starts an anti-wraparound vacuum on it, even if autovacuum is turned off. Unlike a normal autovacuum, it does not give way to other sessions that need a lock on the table, and on a large table it can run for hours and load the disks. If freezing still falls behind, PostgreSQL warns when 40 million IDs are left before the limit and refuses to start new writing transactions when 3 million are left. Reads still work, but the database is down for writes until vacuuming freezes the oldest rows, which first needs whatever holds them back, such as an old transaction, to end ([PostgreSQL](https://www.postgresql.org/docs/18/routine-vacuuming.html#VACUUM-FOR-WRAPAROUND)).

::diagram{name="xid-age"}

That has happened to real systems:

- In 2015, Sentry stopped taking writes for most of a US working day. Vacuuming its largest table would have taken far longer, and the team truncated that table, whose data was not critical, to get writes back ([Sentry, 2015](https://blog.sentry.io/transaction-id-wraparound-in-postgres/)).
- In 2019, Mailchimp's Mandrill sent only part of its email for more than a day. Its sharded databases took uneven load, and autovacuum on the busiest shard likely fell behind or failed; the team could not tell which. The team had noticed three months earlier that XIDs had reached half the limit and had put monitoring in its backlog ([Mailchimp, 2019](https://mailchimp.com/what-we-learned-from-the-recent-mandrill-outage/)).
- In 2021, Notion named stalled vacuuming and the threat of wraparound as the reasons it split its database into shards ([Notion, 2021](https://www.notion.com/blog/sharding-postgres-at-notion)).

Watch `age(datfrozenxid)` for each database and `age(relfrozenxid)` for the largest tables, and alert long before the 200 million mark. Keep vacuuming fast enough with the same tuning as for dead rows, and keep transactions short, because a long one blocks freezing too. Fewer writing transactions also help: inserting 1,000 rows in one transaction uses one XID instead of 1,000, and `COPY` loads many rows in one statement far faster than separate inserts. A forgotten prepared transaction keeps its XID and blocks freezing; find it in `pg_prepared_xacts`. Multixacts, the IDs used when several transactions lock one row, have a counter and a limit of their own: watch `mxid_age(datminmxid)` as well ([PostgreSQL](https://www.postgresql.org/docs/18/routine-vacuuming.html#VACUUM-FOR-MULTIXACT-WRAPAROUND)).

<!-- demo: lower autovacuum_freeze_max_age on a test instance, burn XIDs with a loop of tiny transactions, watch age(datfrozenxid) grow and an anti-wraparound vacuum start. -->

:::avoid
Do not turn off autovacuum to save load on a busy database. Dead rows pile up, statistics go stale, and the vacuuming you skipped comes back as an anti-wraparound vacuum that does not yield, at the worst moment.
:::

## Concurrent writes the PostgreSQL way

Two hosts edit the same listing, and two guests pay for the last free week at the same moment. Isolation levels, locks, and retries handle such conflicts in any database (more on [choosing an isolation level](../../fundamentals/transactions/#choosing-an-isolation-level)). How to use them in PostgreSQL depends on what each level name means there and how its locks work.

What each isolation level does in PostgreSQL:

- Read committed, the default, takes a new snapshot for each statement. An `UPDATE` that waits for another transaction's lock on a row then reads the committed row again and applies itself to it. So `UPDATE homes SET views = views + 1` never loses an increment, but reading a value into the app and writing it back can.
- Repeatable read is snapshot isolation. When a transaction updates a row that another transaction changed and committed after the snapshot was taken, it fails with a serialization error, and the app retries the whole transaction.
- Serializable is SSI: PostgreSQL tracks which transaction read what another one wrote and aborts one of them when their order could not be serial. It catches write skew without explicit locks; the price is more aborted transactions to retry and some memory to track reads. A long report can start with `BEGIN ISOLATION LEVEL SERIALIZABLE READ ONLY DEFERRABLE`: it may wait a moment for a safe snapshot, then runs without SSI tracking and without serialization failures.
- Read uncommitted behaves as read committed.

::diagram{name="update-recheck"}

Row locks have four modes: `FOR UPDATE`, `FOR NO KEY UPDATE` (what an `UPDATE` takes when it does not change a key), `FOR SHARE`, and `FOR KEY SHARE` (what a foreign key check takes on the parent row). An insert of a review only blocks changes to the key of its home, not other updates of that home. PostgreSQL stores a row lock in the row itself, not in a table of locks in memory, so locking a million rows needs no memory per row, but it writes to their pages. `NOWAIT` fails at once instead of waiting for a lock, and `SKIP LOCKED` passes over locked rows (more on [claiming any free rows](../../fundamentals/transactions/#contention-on-one-row)).

A deadlock is found after `deadlock_timeout` (1 second), and PostgreSQL aborts one of the transactions. `log_lock_waits` logs every wait longer than that, which shows the queries that block each other.

An **advisory lock** is a lock on a number that the app chooses, for example the ID of a home whose calendar a worker rebuilds. PostgreSQL does not tie it to any row: only code that asks for the same lock respects it. `pg_advisory_xact_lock` holds it until the transaction ends; the session variants hold it until it is released or the connection closes, so they break behind a pooler in transaction mode. <!-- link: patterns/distributed-locks -->

A `SAVEPOINT` inside a transaction starts a subtransaction, and so does every PL/pgSQL block with an `EXCEPTION` clause. ORMs use savepoints to "find or create" a row. Subtransactions are costly: with more than 64 open subtransactions that wrote something in one transaction, their IDs no longer fit in that backend's cache, and other sessions must look them up on disk pages ([PostgreSQL](https://www.postgresql.org/docs/18/subxacts.html)). A long transaction keeps that state around for longer. GitLab traced slowdowns of its standbys to such savepoints next to a long transaction and removed every savepoint from its code in 2021 ([GitLab, 2021](https://about.gitlab.com/blog/why-we-spent-the-last-month-eliminating-postgresql-subtransactions/)). Where a unique key defines "the same row", `INSERT ... ON CONFLICT` replaces a "find or create" savepoint.

::diagram{name="subxact-overflow"}

:::do
Stay on read committed and make each write a single statement where you can (`UPDATE ... SET x = x + 1`, `INSERT ... ON CONFLICT`). Use `FOR UPDATE` when you read before writing, serializable when a rule spans rows you cannot lock, and retry on serialization errors and deadlocks.
:::

## Changing the schema under load

The service adds instant booking: a new column `instant_book` on `homes`, a constraint, and an index, deployed in the middle of the day while 50 million homes are being searched and booked.

Most `ALTER TABLE` commands take an `ACCESS EXCLUSIVE` lock, which blocks even a plain `SELECT`. Adding a column holds it only for a moment, but first it has to get it. If a long query or a transaction left open still uses the table, the `ALTER` waits, and every new query on the table queues behind the waiting `ALTER`. A change that takes a millisecond stops all traffic to the table for as long as the oldest transaction runs. GoCardless lost 15 seconds of API traffic this way on an older PostgreSQL version, where adding a foreign key still took this lock on the busy table it referred to, and the lock queued behind a long read ([GoCardless](https://gocardless.com/blog/zero-downtime-postgres-migrations-the-hard-parts/)). Since PostgreSQL 9.5, a new foreign key takes a weaker lock that lets reads go on, but it still blocks writes and waits behind them.

Set `lock_timeout` in every migration, to a few seconds, so the `ALTER` gives up instead of blocking everyone, and retry it a moment later. OpenAI applies a 5-second timeout to every schema change ([OpenAI, 2026](https://openai.com/index/scaling-postgresql/)). Each form of `ALTER TABLE` takes its own lock; the [documentation](https://www.postgresql.org/docs/18/sql-altertable.html) lists them.

::diagram{name="lock-queue"}

Some changes rewrite the whole table and hold the lock for all of that time:

| Change | Cost on a large table |
| --- | --- |
| `ADD COLUMN` of a plain type with no default, or with a non-volatile default such as `0` or `now()` | A moment: since PostgreSQL 11, the default is stored once, not in every row |
| `ADD COLUMN` with a volatile default, such as `random()` or `clock_timestamp()`, an identity column, or a stored generated column | Rewrites the table |
| `ALTER COLUMN ... TYPE` | Usually rewrites the table and its indexes; widening `varchar(n)` or changing it to `text` does not |
| `SET NOT NULL` | Scans the table, unless a validated `CHECK (col IS NOT NULL)` already proves it |
| `ADD CONSTRAINT` (check or foreign key) | Scans the table under the lock; split it into `NOT VALID`, then `VALIDATE CONSTRAINT`, which lets reads and writes go on |
| `ADD CONSTRAINT ... UNIQUE` or `PRIMARY KEY` | Builds an index under the lock; build a unique index `CONCURRENTLY` first, then add the constraint `USING INDEX` |
| `CREATE INDEX` | Blocks writes while it builds; use `CONCURRENTLY` |

::diagram{name="not-valid-validate"}

Railway forgot the last row in 2025: an index on a table of about 1 billion rows, built without `CONCURRENTLY`, locked a table that almost every API call used, for about 30 minutes ([Railway, 2025](https://blog.railway.com/p/incident-report-oct-28th-2025)). The team said it would make its CI reject such migrations. Linters such as Strong Migrations for Rails catch these cases before deploy.

Filling the new column for existing rows is a separate step. Run it outside the transaction that changes the schema, in batches of a few thousand rows with pauses between them: each batch writes new row versions and WAL, which feeds dead rows and standby lag, and holds row locks while it runs. OpenAI rate-limits its backfills so strictly that one can take more than a week ([OpenAI, 2026](https://openai.com/index/scaling-postgresql/)). Renaming or dropping a column in use needs the app to stop using it first. <!-- link: patterns/data-migration --> <!-- link: practices/releases -->

<!-- demo: hold a transaction open on homes, run ALTER TABLE ... ADD COLUMN without lock_timeout and watch SELECTs queue behind it; repeat with lock_timeout and a retry. -->

:::do
Give every migration a `lock_timeout` and a retry, build indexes with `CONCURRENTLY`, add check and foreign key constraints as `NOT VALID` and validate them later, and backfill in small batches outside the schema change.
:::

## Running background jobs without a broker

After each booking, the service sends a confirmation email and resizes the photos of new listings. The usual tool for such work is a message broker, a separate system to deploy and run. PostgreSQL can hold the queue itself, with one advantage over a broker: a job can commit in the same transaction as the booking that created it. Either both exist or neither does, with no booking whose email was lost between two systems. <!-- link: patterns/async-processing -->

A queue is a table of jobs, with `locked_until` set in the past for a new job. A worker claims a batch and sets a lease, so that no other worker takes those jobs while the lease lasts:

```sql
UPDATE jobs
SET locked_until = now() + interval '5 minutes',
    attempts = attempts + 1
WHERE id IN (
  SELECT id
  FROM jobs
  WHERE run_at <= now()
    AND locked_until < now()
  ORDER BY run_at
  LIMIT 10
  FOR UPDATE SKIP LOCKED
)
RETURNING id, kind, payload, attempts;
-- 88121 | email  | {"booking_id": 51077} | 1
-- 88124 | resize | {"home_id": 1042}     | 1
```

::diagram{name="skip-locked"}

`SKIP LOCKED` lets many workers claim different jobs at once without waiting for each other. After the work is done, the worker deletes the job, but only if the job still carries its claim: `WHERE id = $1 AND attempts = $2`. If the worker dies or runs past its lease, another worker takes the job again, and this check stops the first worker from deleting the second one's claim. Either way a job can run twice: make each handler safe to repeat, for example with an idempotency key. Order is approximate, because a slow job does not hold back the ones after it. The pgmq extension packs this pattern into functions much like a cloud queue service, and pg_cron runs SQL on a schedule inside the database, such as releasing unpaid bookings every minute. <!-- link: patterns/job-scheduling -->

::diagram{name="lease-claim"}

Workers either poll the table every second or so, or wait for a signal. `LISTEN` and `NOTIFY` send such a signal, but only as a wake-up: a notification goes only to sessions listening at that moment, a worker that was disconnected misses it, and a listener needs its own session, not one shared through a pooler. A `NOTIFY` also takes a lock on the whole instance at commit, so the commits of transactions that notify run one at a time. Recall.ai, with tens of thousands of concurrent writers, had three outages in four days in 2025 because of this and moved the signal into the app ([Recall.ai, 2025](https://www.recall.ai/blog/postgres-listen-notify-does-not-scale)).

Each job is an insert, an update, and a delete, so a busy queue table is mostly dead rows, and it depends on vacuuming more than any other table; an old snapshot anywhere in the database slows every worker. Claiming jobs writes, so only the primary can serve them, and the queue competes with bookings for the same server.

Move the queue to a broker when one message has many independent consumers, when consumers need to replay old messages, when other teams subscribe to the events, or when the job traffic is large enough to slow the main workload. <!-- link: fundamentals/messaging -->

<!-- demo: a jobs table with several workers using SKIP LOCKED; kill a worker and watch its lease expire; add a long transaction and watch claiming slow down. -->

:::do
Keep background jobs in PostgreSQL while one database serves the app: enqueue in the business transaction, claim with `SKIP LOCKED` and a lease, make handlers safe to repeat, and use `NOTIFY` only as a wake-up, if at all.
:::

## Searching by words

Guests type "quiet flat near the beach" into the search box. Without a fitting index, `LIKE '%beach%'` reads every description. It also matches "beachfront", and it cannot rank the results by how well they fit. PostgreSQL has full-text search with an inverted index built in (more on [search by words](../../fundamentals/databases/#searching-by-words)), so for many products the database already holds the search.

A **tsvector** is a document turned into words in a standard form, called lexemes, with their positions; with the English configuration, "beaches" becomes "beach". Store it as a generated column and index it with GIN, giving words in the title more weight than words in the description:

```sql
ALTER TABLE homes
ADD COLUMN search tsvector
GENERATED ALWAYS AS (
  setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
  setweight(to_tsvector('english', coalesce(description, '')), 'B')
) STORED;

CREATE INDEX CONCURRENTLY ON homes USING gin (search);
```

On a large live table, add a plain column instead of a generated one, which would rewrite the table, keep it current with a trigger, and fill the old rows in batches. The language configuration (`'english'`) decides how words become lexemes and which common words are dropped; it must be the same when indexing and when searching, and listings in several languages need the language in a column of their own. Turn what the user types into a query with [`websearch_to_tsquery`](https://www.postgresql.org/docs/18/textsearch-controls.html), which accepts quotes, `or`, and a minus sign the way web search boxes do:

```sql
SELECT id, title
FROM homes, websearch_to_tsquery('english', 'quiet flat beach') AS q
WHERE city = 'Lisbon'
  AND search @@ q
ORDER BY ts_rank(search, q) DESC
LIMIT 20;
-- 3317 | Quiet flat by Carcavelos beach
-- 1289 | Beach studio with a quiet terrace
```

The GIN index finds the matching rows fast, but it stores no positions or weights, so `ts_rank` reads the `tsvector` of every match from the table. Ranking 100,000 matches to show 20 is slow; narrow the matches first, as the city filter does here. Every change to a title or description updates many entries of the GIN index, which makes writes slower than with a B-tree.

::diagram{name="rank-after-match"}

Built-in search has limits. It does not forgive typos: the `pg_trgm` extension compares strings by their three-letter pieces, which finds "Lisbn", serves autocomplete, and gives `LIKE '%beach%'` an index. Its ranking counts how often and how close the words appear, without the BM25 scoring of search engines; extensions such as pg_search add BM25. PostgreSQL can count results by category with SQL and has dictionaries for synonyms. Move search to a search engine when relevance tuning, per-language analysis, fast counts by category next to the results (facets), or machines of its own for search load cost more to build in PostgreSQL than to run another system. <!-- link: technologies/elasticsearch --> <!-- link: patterns/search -->

<!-- demo: LIKE vs tsvector with GIN on the listings; ts_rank cost with many matches; pg_trgm for typos. -->

:::do
Start search inside PostgreSQL: a stored `tsvector` with weights, a GIN index, `websearch_to_tsquery`, and `pg_trgm` for typos. Filter before you rank. Move to a search engine when tuned relevance, per-language analysis, or facets at your load become too costly to build in PostgreSQL.
:::

## Searching by place

The map view shows homes within 5 km of a point, nearest first, and the homes inside the part of the map on the screen. A B-tree index on latitude can narrow the search to one band of the map, but then it checks the longitude of every home in that band. Points on a plane need an index of their own. <!-- link: patterns/proximity-search -->

The **PostGIS** extension adds types, functions, and indexes for places. Store a home's location as `geography(Point, 4326)`: a point given as longitude, then latitude, with distances in meters on the curved surface of the Earth. The `geometry` type computes on a flat plane, which is faster but distorts distances unless the data uses a projection made for the area. A GiST index stores a bounding box for each shape and finds the boxes near the query first:

```sql
CREATE INDEX CONCURRENTLY ON homes USING gist (location);

SELECT id, title
FROM homes
WHERE ST_DWithin(location, ST_MakePoint(-9.14, 38.71)::geography, 5000)
ORDER BY location <-> ST_MakePoint(-9.14, 38.71)::geography
LIMIT 20;
-- 1042 | Villa with a pool in Belém     (nearest first)
-- 5120 | Loft near Rossio
```

::diagram{name="knn-search"}

Only some functions use the index. `ST_DWithin` does; `ST_Distance(...) <= 5000` means the same thing, but it computes the distance to every row. In a test on an OpenStreetMap extract with flat coordinates and a 500 m radius, the first form took 1.1 ms and the second 488 ms ([Magda](https://www.manning.com/books/just-use-postgres)). The `<->` operator returns the nearest rows straight from the index. For `geography` it measures on a sphere, which can order nearly equal distances slightly differently from `ST_Distance`; when exact order matters, keep the `ST_DWithin` filter, order all rows it finds by `ST_Distance`, and apply the `LIMIT` after that ([PostGIS](https://postgis.net/docs/geometry_distance_knn.html)). [`ST_Covers(area, location)`](https://postgis.net/docs/ST_Covers.html) finds the homes inside a drawn area, such as a neighborhood, including those on its border. Distance in a straight line is not travel time; routes need the pgRouting extension or a routing service.

::diagram{name="dwithin-vs-distance"}

PostGIS fits places that change rarely, like homes. Objects that report their position every few seconds, such as drivers, are a different load: each report updates an indexed column, so the update cannot be HOT, and the index and the dead rows churn. When that write load costs the primary more than it can spare, keep such points in an in-memory index outside the database.

:::do
Use PostGIS with `geography` points and a GiST index for searches around a point or inside an area, and write queries with `ST_DWithin`, `<->`, and `ST_Covers` so they use the index. Measure the write load of fast-moving positions before you keep them in the main tables.
:::

## Searching by meaning

"Similar homes" should find homes like the one a guest is viewing, and a search for "cozy place to work remotely" should find a listing described as "quiet loft with a big desk and fast Wi-Fi". This is search by embedding vectors, and the pgvector extension keeps them in PostgreSQL next to the listing (more on [search by meaning](../../fundamentals/databases/#searching-by-meaning)).

A vector of 1,024 numbers takes about 4 KB per row. Exact search compares the query with every vector and returns the true nearest ones; it is the right choice for small sets and for queries whose filters leave few rows. For more, pgvector has two approximate indexes:

- **HNSW** builds a graph of neighbors. It gives better recall and speed for a given amount of work, can be built on an empty table, and keeps up as rows are added. It builds slowly and takes a lot of memory; the build is much faster when the graph fits in `maintenance_work_mem`.
- **IVFFlat** splits the vectors into clusters when it is built and searches only the clusters closest to the query (`ivfflat.probes`). It builds faster and takes less memory, but it must be built after the data is loaded, and its recall drops as new data moves away from the original clusters, so it needs rebuilds.

::diagram{name="hnsw-vs-ivfflat"}

Both trade recall for speed with a setting per query (`hnsw.ef_search`, 40 by default, and `ivfflat.probes`, 1 by default). Measure recall on real queries against exact search before you pick the values. Indexes accept vectors of up to 2,000 numbers, or up to 4,000 with `halfvec`, which stores each number in half the space ([pgvector](https://github.com/pgvector/pgvector#hnsw)).

Filters need care. An approximate index first finds the nearest candidates and only then applies the `WHERE` clause. With the default `ef_search` of 40, a filter that matches 10% of homes leaves about 4 results instead of 20. Since pgvector 0.8, iterative index scans read further into the index until enough rows pass or a scan limit is reached. Turn them on with `SET hnsw.iterative_scan = strict_order`; the relaxed mode, the only one for IVFFlat, can return rows slightly out of order, so sort them again by distance. A filter on a few values can also use a partial index, one per value ([pgvector](https://github.com/pgvector/pgvector#filtering)).

::diagram{name="filtered-ann"}

Before adding another system, try smaller vectors (`halfvec`, fewer dimensions) and index settings. Move vectors to a dedicated vector database when the index still does not fit the memory you can give it, when you need to split it across machines, or when filtered searches at your scale do not reach the recall you need. <!-- link: patterns/vector-search -->

<!-- demo: pgvector with HNSW and IVFFlat on listing embeddings; recall against exact search; a filtered query with and without iterative scans. -->

:::do
Start with pgvector next to the data: exact search while the set or the filtered candidates are small, an HNSW index when exact search is too slow. Measure recall against exact search, turn on iterative scans for filtered queries, and plan memory for the index.
:::

## Caches, counters, and time series inside PostgreSQL

Every price on the site is shown in the guest's currency, and the rates come from a paid outside service. Hosts want a dashboard with views and bookings per day, and the team wants a history of each home's nightly price. Each of these usually brings in another system: a cache, a counter store, a time-series database. PostgreSQL covers much of it while the extra load stays small next to the main work.

An **unlogged table** (`CREATE UNLOGGED TABLE`) skips the WAL, so its writes are much cheaper. After a crash or an unclean shutdown it comes back empty, and standbys get none of its contents. That is fine for a cache: store each value with an `expires_at` column, ignore expired rows when reading, and delete them on a schedule with pg_cron. Such a table suits the results of slow or paid calls, such as exchange rates. It does not take load off the database: each read is still a query to the same server, and every expired row becomes a dead row to vacuum. When the goal is to protect the database from repeated reads, or reads must take well under a millisecond, put an in-memory cache such as [Redis](../redis/#taking-hot-data-off-the-database) in front of it (more on [a cache in front of the database](../../fundamentals/caching/#putting-a-cache-in-front-of-the-database)).

A **materialized view** stores the result of a query as a table. The host dashboard reads daily totals from it instead of scanning bookings on every page load. `REFRESH MATERIALIZED VIEW` runs the whole query again and blocks reads of the view while it runs. With `CONCURRENTLY`, reads go on, but the view must already hold data and needs a unique index on plain columns that covers all rows. It compares the new result with the old one, so it often does more work, though it can be faster when little changed. Core PostgreSQL has no incremental refresh, so each refresh costs the full query: refresh on a schedule that matches how fresh the numbers must be.

A view counter in one row makes every view wait for the lock of the one before (more on [why an update is costly](#an-update-writes-a-new-row)). Insert a row for each event instead, or for each home and minute, and let a job add them into the counter in batches. In a test where 100 workers each recorded 10 events, updates of one shared row took 3.10 s, and inserts of separate rows 2.13 s ([Fontaine](https://theartofpostgresql.com/)). Totals have a cost of their own: PostgreSQL keeps no exact row count for a table, because each transaction may see a different number of rows, so `count(*)` reads the whole table or an index. On 10 million rows, an exact count took 400 ms to 3.5 s depending on the cache, while the planner's estimate in `pg_class.reltuples` took 3.7 ms ([Atkinson](https://pragprog.com/titles/aapsql/high-performance-postgresql-for-rails/)). Show "about 10 million homes" from the estimate, or keep exact totals in a counter table. <!-- link: patterns/counting -->

::diagram{name="counter-vs-events"}

Price history and search events are written once, in time order, and read by time ranges. A B-tree on the timestamp works, but it grows with the table. A BRIN index stores a summary of each range of pages, by default the lowest and highest value, so it stays tiny. In a TimescaleDB example, BRIN indexes on the time column of single time chunks took 24 KB each, while B-tree indexes on time and device of such chunks took 1.4 or 3.9 MB ([Magda](https://www.manning.com/books/just-use-postgres)). It helps only while the order of rows on disk follows time: late inserts and updates widen the ranges, and the index skips fewer pages. Old data goes away by dropping whole partitions (more on [splitting one big table](#one-table-too-big)). The TimescaleDB extension creates time partitions by itself and adds compression and continuous aggregates, which keep hourly or daily totals current. Move to a dedicated time-series database when the measured ingest and query load of metrics competes with the main work, or when you need rollups and retention per series that PostgreSQL and TimescaleDB make costly. <!-- link: technologies/time-series-databases -->

::diagram{name="brin-ranges"}

<!-- demo: an unlogged cache table with expiry by pg_cron; a materialized view refreshed CONCURRENTLY; one-row counter vs appended events under pgbench; BRIN vs B-tree size on time-ordered data. -->

:::do
Use an unlogged table for a cache of slow or paid calls, a materialized view for totals that may be minutes old, appended rows for hot counters, and BRIN with time partitions for history. Add an in-memory cache when reads must leave the database, and a time-series database when metrics compete with the main work.
:::

## Copies on other servers

The service must survive the loss of its database server, and search traffic has grown beyond what one server can read. Both need copies of the data on other servers (more on [keeping a copy on another node](../../fundamentals/replication/#keeping-a-copy-on-another-node)).

PostgreSQL calls the leader the primary and the followers standbys. With **streaming replication**, the primary sends its WAL to each standby over a connection as it is written, and the standby replays it. This is physical replication: a standby is a byte-for-byte copy of the whole instance, with every database in it. It must run the same major version on the same platform, and it accepts only reads (a hot standby). A new standby starts from a copy of the primary's files taken with `pg_basebackup`, then asks for the WAL after that point.

Replication is asynchronous by default. To have commits wait for standbys, list them in `synchronous_standby_names`, and `synchronous_commit` decides what the commit waits for:

| `synchronous_commit` | The commit returns when the WAL is |
| --- | --- |
| `off` | Not waited for at all; flushed on the primary within about 0.6 s with default settings |
| `local` | Flushed on the primary |
| `remote_write` | Flushed on the primary and handed to the operating system on the synchronous standbys; a crash of a standby's machine can still lose it |
| `on`, the default | Flushed on the primary and on the synchronous standbys |
| `remote_apply` | Flushed on the primary and on the synchronous standbys, and replayed there, so new queries on those standbys see it |

When `synchronous_standby_names` is empty, `on`, `remote_write`, and `remote_apply` act like `local` ([PostgreSQL](https://www.postgresql.org/docs/18/runtime-config-wal.html#GUC-SYNCHRONOUS-COMMIT)). Set the level per transaction: a payment waits for a standby, a view counter does not. If no synchronous standby answers, commits wait forever, so list more than the number you wait for: `ANY 1 (s1, s2)` waits for whichever of two standbys answers first, which takes three servers in total.

::diagram{name="sync-commit-levels"}

A standby lags behind, and `pg_stat_replication` on the primary shows by how much at each step: sent, written, flushed, and replayed. Reads see a write only after replay. For a user who must see their own write, read from the primary, or note the primary's WAL position (`pg_current_wal_lsn()`) after the write and read from a standby only once its `pg_last_wal_replay_lsn()` has reached it, in a new snapshot (more on [seeing your own writes](../../fundamentals/replication/#seeing-your-own-writes)). `remote_apply` helps only on the standbys that acknowledged the commit: with `ANY 1` of two, the other one may still be behind.

::diagram{name="lsn-fence"}

Queries on a standby can conflict with replay. Vacuuming on the primary removes row versions that a long query on the standby still reads. The standby then delays replay, by up to 30 seconds in total by default (`max_standby_streaming_delay`), and then cancels the query; a query that comes after earlier delays may get much less time. With `hot_standby_feedback = on`, the standby tells the primary which versions it still needs, and such conflicts stop, but dead rows pile up on the primary as if the long query ran there (more on [dead rows](#dead-rows-pile-up)). Other conflicts, such as a schema change replayed from the primary, can still cancel queries; `pg_stat_database_conflicts` counts them. Give long reports a standby of their own with a longer delay, and keep feedback off on the standbys that must stay current.

::diagram{name="standby-conflict"}

The primary keeps WAL only as long as it needs it. A standby that was down too long finds the WAL it needs deleted and must fetch it from the WAL archive, if there is one, or start from a new copy. A **replication slot** makes the primary keep the WAL that its consumer still needs. The price is that a standby that is gone for good makes WAL pile up until the disk fills and the primary stops. Set `max_slot_wal_keep_size` (PostgreSQL 13, unlimited by default): at a checkpoint, a slot that holds more WAL than that is invalidated, and its standby needs the archive or a new copy. Alert on the WAL that each slot holds in `pg_replication_slots`.

::diagram{name="slot-retention"}

Every standby adds work on the primary: one process and one copy of the WAL stream each. OpenAI serves ChatGPT from one primary and nearly 50 standbys in many regions, and it named the cost of streaming WAL to all of them as a limit. It is testing cascading replication, where standbys feed other standbys, to grow past 100 ([OpenAI, 2026](https://openai.com/index/scaling-postgresql/)).

<!-- demo: a primary and two standbys; watch lag in pg_stat_replication under pgbench; ANY 1 synchronous commit with one standby stopped; a slot that holds WAL while its standby is down. -->

:::do
Run at least one standby in another availability zone. Make commits that must survive the loss of the primary wait for a quorum such as `ANY 1` of two standbys, and leave the rest asynchronous. Use slots with `max_slot_wal_keep_size` set and a WAL archive to catch up from, and keep long reports on a standby of their own.
:::

## Replacing a failed primary

At night, the primary's machine stops. Standbys still serve searches, but nobody can book.

PostgreSQL has no built-in failover. `pg_promote()` turns a standby into a primary, and nothing more: it does not stop the old primary, does not move the clients, and does not point the other standbys at the new primary. The steps of failover and their risks are the same in every database (more on [replacing a failed leader](../../fundamentals/replication/#replacing-a-failed-leader)); for PostgreSQL, a separate tool carries them out.

The common choice is **Patroni**. It runs next to each PostgreSQL server and keeps a leader key in a coordination service such as etcd, with a time to live, 30 seconds by default. The server whose Patroni holds the key is the primary and renews the key every 10 seconds. When the key expires, the standbys race for it, and only one close enough to the old primary in WAL may take it and promote itself. A primary that cannot renew the key demotes itself. That alone is not enough: a paused or stuck Patroni may fail to demote in time, so turn on its watchdog, which restarts the machine when Patroni stops responding, or another way to fence the old primary (more on [letting only one node act](../../fundamentals/consistency/#letting-only-one-node-act)). <!-- link: technologies/etcd --> On Kubernetes, operators such as CloudNativePG do the same job. <!-- link: technologies/kubernetes -->

::diagram{name="patroni"}

::diagram{name="leader-key-expiry"}

After a failover, the old primary may hold writes that never reached the new one. It cannot simply follow the new primary: `pg_rewind` brings it back in line by copying the pages that differ, which needs data checksums or `wal_log_hints`, or it is rebuilt from a fresh copy. With asynchronous replication, those writes are lost. Commits made with synchronous replication survive only if the promoted standby was one that confirmed them: Patroni's `synchronous_mode` promotes only such a standby. When no synchronous standby is left, Patroni by default lets the primary take writes alone and then refuses an automatic failover that could lose them; `synchronous_mode_strict` makes writes wait for a standby instead. For a quorum such as `ANY 1` of two, use Patroni's `synchronous_mode: quorum` rather than setting `synchronous_standby_names` by hand. Transactions that set `synchronous_commit` to `local` or `off` get no such promise ([Patroni](https://patroni.readthedocs.io/en/latest/replication_modes.html)).

Clients must find the new primary. Give drivers a list of hosts with `target_session_attrs=read-write`, so they connect only to the server that takes writes. Or put a proxy in front that asks Patroni which server is the primary: a port check passes on every running server, standbys included. Point the pooler at whatever routing you choose.

Managed services, such as Amazon RDS, Azure Database for PostgreSQL, and Google Cloud SQL, exist because of this gap. When you choose their high-availability option and set the backup and maintenance policies, they run the standby, the failover, the routing by DNS name, the backups with point-in-time recovery, and minor upgrades. The price is money and control: no superuser, a fixed list of extensions and settings, and failover times the provider sets, typically 60–120 seconds for an RDS instance with a standby in another zone ([AWS](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/Concepts.MultiAZ.Failover.html)). Amazon Aurora goes further and replaces PostgreSQL's storage: it writes the log to six copies in three zones and counts a write as done on four of them, and its read servers use the same storage instead of keeping copies of their own ([Verbitski et al., 2017](https://www.amazon.science/publications/amazon-aurora-design-considerations-for-high-throughput-cloud-native-relational-databases)). Failover then copies no data, though recovery and reconnecting clients still take time, and the storage layer is no longer PostgreSQL's, so check that it behaves the way your design assumes.

::diagram{name="aurora-storage"}

<!-- demo: Patroni with etcd and three nodes; kill the primary; watch the leader key move, clients reconnect through target_session_attrs, and the old primary rejoin with pg_rewind. -->

:::do
Use a managed service unless you need control it does not give. When you run PostgreSQL yourself, use Patroni with a watchdog or a Kubernetes operator with three servers, route clients by role rather than by a port check, and practice a failover before you need one.
:::

## Getting data back after a mistake

A release deletes the calendars of 10,000 homes. Within a second, every standby deletes them too (more on [undoing a bad write](../../fundamentals/replication/#undoing-a-bad-write)). Getting them back needs a copy from before the mistake, and PostgreSQL has two kinds.

`pg_dump` writes a logical copy of one database: the schema and the rows, read from one snapshot while the database keeps working. It loads into another version or another machine, and one table can be restored from it. Restoring runs every insert again and rebuilds every index, so a large database takes hours. A dump holds one moment: everything written after it is lost, and roles and other instance-wide settings need `pg_dumpall --globals-only`.

A physical backup copies the files of the whole instance (`pg_basebackup`), and a WAL archive keeps every WAL segment after it, for example in object storage (`archive_command`). Together they give point-in-time recovery: restore the files and replay the WAL up to a chosen moment, such as one second before the bad release (`recovery_target_time`). The recovered server then starts a new timeline of WAL, so it never mixes its history with the old one. A physical backup restores the whole instance only: to get one table back, restore it on another server and copy the rows over.

::diagram{name="pitr-timeline"}

Tools such as pgBackRest and Barman run this for you: parallel and compressed backups, incremental ones, retention, checks, and storage in object storage. Since PostgreSQL 17, `pg_basebackup` can take incremental backups as well; `pg_combinebackup` joins them with the full backup before a restore. Watch the archive: when `archive_command` fails, the primary keeps the WAL it has not archived, and the disk fills.

A backup that nobody restored is a guess. In GitLab's 2017 outage, the nightly `pg_dump` had used version 9.2 tools against a 9.6 server and failed every time, and its error emails were rejected, so nobody knew ([GitLab, 2017](https://about.gitlab.com/blog/postmortem-of-database-outage-of-january-31/)). Check each backup with `pg_verifybackup` or the checks of your backup tool. Then restore regularly onto another server, replay the WAL to a chosen moment, run real queries against the result, and time the whole restore, because that time is the floor of your recovery time for this failure. A standby that replays an hour late (`recovery_min_apply_delay`) gives a quicker way back from a mistake noticed within that hour, but it does not replace backups.

<!-- demo: pgBackRest full and incremental backups with a WAL archive in MinIO; drop a table, then restore to the second before the drop on another server. -->

:::do
Back up the instance with a physical backup and a continuous WAL archive, kept away from the database servers, with a tool such as pgBackRest. Add `pg_dump` for single databases you move or keep long. Alert on failed backups and archiving, and restore on a schedule to prove they work.
:::

## Copying changes row by row

The service adds a search engine for listings, and the analytics team wants every booking in its warehouse within a minute. Both need each change as a row, not as changed pages of a file.

**Logical decoding** turns the WAL into a stream of row changes: inserts, updates, and deletes, grouped by transaction, in commit order. It needs `wal_level = logical`. On top of it, built-in logical replication copies chosen tables: a publication on the source names them, and a subscription on the target copies their current rows, then applies every change after that. Unlike a standby, the target is an ordinary server: it takes its own writes, can have other indexes, and can run a newer major version. Writes on the target to the same rows that arrive from the source cause conflicts, so keep them apart (more on [what the replication log carries](../../fundamentals/replication/#choosing-what-the-log-carries)).

It copies changes to table rows, including `TRUNCATE`, and little else. Schema changes are not copied, so apply them on both sides yourself; for added columns and tables, the target goes first. Sequence values and large objects are not copied either; move sequences forward before the target takes writes ([PostgreSQL](https://www.postgresql.org/docs/18/logical-replication-restrictions.html)). To find the row an update or a delete refers to, a table needs a primary key or another unique index chosen as its `REPLICA IDENTITY`, or `REPLICA IDENTITY FULL`, which writes the whole old row to the WAL and makes the target search for it.

Each subscription uses a slot on the source, and a logical slot has the risks of any slot: a consumer that stops makes WAL pile up until the disk fills, and it also holds back the cleanup of the system catalogs. Before PostgreSQL 17, a logical slot on the primary was not carried over to a standby by PostgreSQL itself, so after a failover a consumer often had to start over with a full copy. PostgreSQL 17 can copy slots created for failover to a standby, in the background, with `sync_replication_slots` on the standby. On the primary, `synchronized_standby_slots` makes logical consumers wait until that standby has the same WAL, so they never get ahead of it. Check that the slots are ready on the standby before you promote it ([PostgreSQL](https://www.postgresql.org/docs/18/logical-replication-failover.html)).

::diagram{name="failover-slots"}

Change data capture (CDC) tools such as Debezium read the same stream through a slot and publish each change to a broker, from which the search engine and the warehouse take it. Write the booking and an event to an outbox table in one transaction, and CDC publishes only events that committed; consumers still have to handle an event delivered twice. <!-- link: patterns/async-processing --> <!-- link: technologies/kafka --> The same tools move tables to another database with little downtime. <!-- link: patterns/data-migration -->

::diagram{name="logical-decoding"}

<!-- demo: a publication and a subscription between two servers; a schema change that breaks it; Debezium reading bookings into Kafka; a stopped consumer whose slot holds WAL. -->

:::do
Use logical replication to copy tables to another server or version, and CDC through a slot to feed other systems with changes. Give every published table a primary key, plan schema changes on both sides, and alert on the WAL each slot holds.
:::

## Moving to a new major version

The service runs PostgreSQL 14, which reaches its end of support in November 2026. Moving to 18 brings new features, such as asynchronous I/O and `uuidv7()`, but a major version can change the data files, so a standby cannot simply follow a primary on a newer version.

PostgreSQL releases a major version every year and supports each for five years. Minor releases come at least every three months, contain only fixes, and keep the file format, so you install the new binaries and restart, standbys first and then the primary after a switchover ([PostgreSQL](https://www.postgresql.org/support/versioning/)). Skipping minor releases leaves known bugs, including data-corrupting and security ones, in place; apply urgent fixes without waiting for the next quarter.

A major upgrade takes one of three paths:

- Dump and restore: the slowest, hours for a large database, with writes stopped for the whole time.
- `pg_upgrade` builds a new system catalog and reuses the data files. With `--link`, it does not copy the data, so it often takes minutes even for large databases; the time grows with the number of tables and objects, so measure it on a copy. Once the new server starts, the old one cannot be started again. Writes stop for that time, and the standbys are upgraded with `rsync` as the documentation describes, or rebuilt. Before PostgreSQL 18, it did not keep the planner's statistics, so queries ran with poor plans until `ANALYZE` finished; since 18 it keeps most of them; run the commands it prints after the upgrade to rebuild the rest ([PostgreSQL](https://www.postgresql.org/docs/18/pgupgrade.html)).
- Logical replication: a new server on the new version subscribes to the old one and catches up while the service runs. At the switch, stop every writer: pause the pooler (PgBouncer's `PAUSE`), and also the jobs and clients that connect around it. Wait until the new server has applied everything, move sequence values forward, point the pooler at it, and resume. Writes usually wait for seconds; measure it in a rehearsal. The new server needs a full copy of the data and time to catch up, and schema changes must be made on both servers or wait until the switch. When the old server already runs PostgreSQL 17 or later, `pg_createsubscriber` turns a standby of the same version into a logical subscriber, which saves the initial copy; that subscriber is then upgraded with `pg_upgrade` as a separate step.

::diagram{name="upgrade-paths"}

::diagram{name="logical-cutover"}

A new major version can change behavior, not only speed: PostgreSQL 12, for example, began inlining `WITH` queries into the main query, which changed their plans. Extensions need versions built for the new release too. Moving to a new operating system can change how text sorts, which breaks indexes on text: check the collation versions and rebuild the affected indexes. Run the test suite against the new version, compare the plans of the top queries from `pg_stat_statements`, and keep a way back until the new version has run under real load. Uber stayed on 9.2 in 2016 partly because a major upgrade of its replicated setup meant hours of downtime ([Uber, 2016](https://www.uber.com/blog/postgres-to-mysql-migration/)). <!-- link: practices/releases -->

<!-- demo: upgrade 14 to 18 two ways: pg_upgrade --link with timing, and logical replication with a PgBouncer PAUSE switch; measure the write pause. -->

:::do
Apply minor releases soon after they come out. Plan a major upgrade every year or two, before support ends: `pg_upgrade --link` when the measured pause without writes is acceptable, logical replication when it must be shorter. Test plans and extensions on the new version first.
:::

## One table too big

After a few years, the table of search events holds 5 billion rows and 2 TB, and a nightly job deletes events older than 90 days. The delete runs for hours, leaves millions of dead rows, and vacuuming the table takes longer than a day.

**Table partitioning** splits one table into several on the same server, by ranges of a column (`RANGE`, usually time), by lists of values (`LIST`, such as country), or by a hash (`HASH`). Queries and inserts go to the parent table, and PostgreSQL sends each row to its partition:

```sql
CREATE TABLE search_events (
  id bigint GENERATED ALWAYS AS IDENTITY,
  created_at timestamptz NOT NULL,
  query text,
  PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

CREATE TABLE search_events_2026_05
PARTITION OF search_events
FOR VALUES FROM ('2026-05-01') TO ('2026-06-01');
```

::diagram{name="partition-pruning"}

Two things get cheaper. A query that filters by the partitioning column reads only the partitions that can match, and skips the rest. On 150 million payments, a query without a fitting index went from 62 s to 2.5 s after the table was split by month, because it read 348 MB instead of 9 GB ([Angelakos](https://www.manning.com/books/postgresql-mistakes-and-how-to-avoid-them)). And old data leaves by dropping a whole partition: deleting 1.2 million old rows took 65.9 s, dropping their partition 43 ms, with no dead rows left behind ([Angelakos](https://www.manning.com/books/postgresql-mistakes-and-how-to-avoid-them)). Each partition also has its own indexes and is vacuumed on its own.

::diagram{name="delete-vs-drop"}

The price shows up everywhere else:

- A primary key or a unique constraint must include the partitioning column, which is why the key above is `(id, created_at)`. PostgreSQL has no index across all partitions, so it cannot keep an `id` unique by itself, and a foreign key that refers to the table must use the whole key.
- A query without a condition on the partitioning column may have to read every partition, and planning time grows with the number of partitions. Measure planning time at the number of partitions you plan; hundreds are common, thousands need care.
- An insert for which no partition exists fails. Create partitions ahead of time with pg_partman and pg_cron, and alert when the next one is missing.
- An existing table does not turn into a partitioned one in place. Create a new partitioned table, copy the rows in batches while a trigger or logical replication carries over the changes made during the copy, and switch the app to it; views and foreign keys that refer to the old table need moving too. <!-- link: patterns/data-migration -->
- Dropping a partition locks the parent table for a moment. `DETACH PARTITION ... CONCURRENTLY` (PostgreSQL 14) takes a weaker lock, then drop the detached table. `CREATE INDEX CONCURRENTLY` does not work on the parent: build the index on each partition and attach it. Autovacuum does not analyze the parent, so run `ANALYZE` on it yourself.

Partition a table when you have a concrete problem that partitioning solves: deleting old data, vacuum time, or queries that always filter by time. A table larger than memory, or larger than about 100 GB, is a sign to look for such problems, not a reason by itself ([Atkinson](https://pragprog.com/titles/aapsql/high-performance-postgresql-for-rails/)). All partitions still live on one server and share its CPU, disks, and WAL. Partitioning makes a table manageable; it does not add capacity, as splitting the data across servers does (more on [splitting a table across nodes](../../fundamentals/sharding/#splitting-a-table-across-nodes)).

<!-- demo: a search_events table partitioned by month with pg_partman; compare DELETE of a month against DROP of its partition; show partition pruning in EXPLAIN. -->

:::do
Partition large tables that grow by time and lose old data by time, by a range of the time column, and drop partitions instead of deleting rows. Create future partitions automatically, and do not expect partitioning to raise the limits of the server.
:::

## When one primary is not enough

Search, bookings, messages, and payments all run on one primary, and at peak it runs out of CPU and disk throughput. Every write in PostgreSQL goes through this one server, so its write load is the limit that standbys do not raise. Teams that met this limit picked from the same set of steps, the cheaper ones usually first, by what their bottleneck was:

1. Remove waste and buy a bigger machine. Fix the top queries, drop unused indexes, put a pooler in front, and move to the largest instance. Figma moved its database to the largest instance AWS offered before it split anything ([Figma, 2023](https://www.figma.com/blog/how-figma-scaled-to-multiple-databases/)).
2. Move reads to standbys and caches. OpenAI serves millions of queries per second for ChatGPT from one primary and nearly 50 standbys ([OpenAI, 2026](https://openai.com/index/scaling-postgresql/)).
3. Write less. OpenAI cut writes in the app, let some writes happen later, and stopped adding tables to PostgreSQL: new workloads with heavy writes go to a sharded database ([OpenAI, 2026](https://openai.com/index/scaling-postgresql/)).
4. Move groups of tables to their own databases. Figma moved groups of related tables, picked by their share of the load and by how few joins tied them to the rest, to separate PostgreSQL servers. Joins and transactions across the groups moved into the app ([Figma, 2023](https://www.figma.com/blog/how-figma-scaled-to-multiple-databases/)).
5. Shard by key. Notion split its data by workspace ID into 480 logical shards on 32 servers ([Notion, 2021](https://www.notion.com/blog/sharding-postgres-at-notion)), and two years later moved them to 96 servers with logical replication and no downtime ([Notion, 2023](https://www.notion.com/blog/the-great-re-shard)). Figma built sharding into its own proxy in front of PostgreSQL after weighing distributed databases; sharding its first table took about nine months, and the rest of the work went on longer ([Figma, 2024](https://www.figma.com/blog/how-figmas-databases-team-lived-to-tell-the-scale/)).

Sharding by hand makes the app send each query to the right shard, and gives up joins, constraints, and transactions across shards (more on [sharding](../../fundamentals/sharding/#outgrowing-one-node)). The **Citus** extension does the routing inside PostgreSQL: a coordinator splits tables by a distribution column across worker servers, and tables split by the same column, such as everything keyed by host, join on each worker. Every shard, whatever does the routing, adds its own standbys, backups, vacuuming, upgrades, and connection budget.

::diagram{name="citus"}

Shards can live in different regions, each taking writes for its own users. Leave PostgreSQL for this part of the data when the same rows need writes accepted locally in several regions, with availability or coordination that one primary per shard cannot give, or when the write rate needs automatic resharding that you do not want to build. Distributed SQL databases such as CockroachDB and YugabyteDB speak the PostgreSQL protocol, but they are different systems: extensions, isolation, and performance differ, so test what the app relies on. <!-- link: technologies/distributed-sql --> For very high write rates of simple records read by key, a wide-column store such as Cassandra fits. <!-- link: technologies/cassandra -->

:::explain
Start on one PostgreSQL primary with standbys, and say what would make you change that: the write load of the primary, the size of the largest tables, or the same data needing local writes in several regions. Then name the steps and what each one fixes: tune and scale up, move reads to standbys and caches, move independent groups of tables to their own servers, and shard a dominant data set by a key such as the host or the tenant.
:::

:::do
Push one primary as far as tuning, a larger machine, standbys, and caches take it. Move independent groups of tables out when they share little with the rest, shard by key when one data set is the limit, and use many logical shards on few servers so that you can move them later.
:::

## Cheat sheet

- One instance is a postmaster with a process per connection, shared buffers on top of the OS page cache, and background processes for writing pages, vacuuming, and sending WAL to standbys. All writes go to one primary; start shared buffers at about a quarter of RAM on a dedicated machine.
- A commit waits for the WAL flush, and one flush serves many commits. Checkpoints bound recovery; full-page copies protect from torn pages. `synchronous_commit = off` can lose the last commits, up to about 0.6 s with default settings, without breaking the data; never turn off `fsync` or `full_page_writes`. Keep data checksums on.
- Put rules for all writers into the table definitions where PostgreSQL can express them: types, `NOT NULL`, `CHECK`, unique and foreign keys, and exclusion constraints on ranges against overlaps. Use `timestamptz`, `numeric`, `text` with `CHECK`, and `bigint` identity; expect gaps in sequences; index foreign keys you join or delete on; `uuidv7()` (PostgreSQL 18) keeps new keys mostly at the end of the index.
- JSONB holds varied attributes next to typed columns. A GIN index serves containment, key tests, and JSONPath; `jsonb_path_ops` is smaller and has no key tests; a B-tree on one expression is far smaller. The planner has no statistics inside documents unless you add them, and keys inside are checked only by `CHECK`.
- A table is a heap of 8 KB pages; B-tree indexes point to a row's TID, so an update that is not HOT needs new entries in the applicable ones. Long values in rows over about 2 KB are compressed or moved to TOAST; select only the columns you need.
- Pick an index by the operator: B-tree for equality, ranges, and order; GIN for "contains"; GiST for overlaps and distance; BRIN for huge tables in time order. An index on `(a, b)` serves `a`, `a` with `b`, and `a` ordered by `b`; `b` alone reads most of it, unless skip scan helps. Partial, expression, and covering indexes fit narrower queries. An index that fetches rows from the table pays off when the queried value matches a small share of them; every index slows writes.
- Rank queries by total time in `pg_stat_statements`, check for lock waits, read `EXPLAIN (ANALYZE, BUFFERS)`, and fix the earliest real cause: a wrong estimate, a function over a column, a generic plan, a spill, `OFFSET`, or N+1 queries.
- Each connection is a process, and past some number of active connections, more only add latency. Use a pooler such as PgBouncer in transaction mode, size pools from the server side, and set timeouts per role. Session state such as `SET`, `LISTEN`, and session advisory locks breaks behind it.
- An update writes a new row version and new entries in every applicable index that points to rows, unless it is a HOT update: no column used by those indexes changed and the page had room. A BRIN index does not prevent HOT (PostgreSQL 16). Keep hot columns out of indexes and try a lower `fillfactor` on tables with many updates.
- Vacuuming removes old versions but rarely shrinks files. Tune autovacuum per large table, and keep snapshots and writing transactions short, because the oldest one keeps newer dead rows in every table. Fix what holds cleanup back first, and rebuild online only when the remaining bloat is worth the locks, disk, and I/O.
- 32-bit transaction IDs wrap around; vacuuming freezes old rows. With 3 million IDs left, the database refuses new writing transactions. Alert on `age(datfrozenxid)` well before 200 million and keep vacuuming fast.
- Read committed is the default and re-reads a locked row before an update; repeatable read is snapshot isolation; serializable is SSI with retries. Row locks live in the rows; advisory locks are app conventions. Avoid many savepoints in one transaction.
- Most `ALTER TABLE` commands queue behind long transactions and block everything behind them: set `lock_timeout` and retry. Avoid table rewrites, add check and foreign key constraints `NOT VALID`, build indexes `CONCURRENTLY`, and backfill in batches.
- A job table with `FOR UPDATE SKIP LOCKED`, leases, deletes that check the claim, and handlers safe to repeat replaces a broker while jobs commit with the business data. `NOTIFY` is only a wake-up for connected listeners, and the commits that notify run one at a time. Move to a broker for fan-out, replay, or heavy traffic.
- Full-text search: a stored `tsvector`, GIN, and `websearch_to_tsquery`; filter before ranking, `pg_trgm` for typos and substrings. Move to a search engine when relevance, per-language analysis, or facets cost too much to build in PostgreSQL.
- PostGIS: `geography` points and a GiST index; `ST_DWithin`, `<->`, and `ST_Covers` use it, `ST_Distance` in a filter does not. Measure the write load of fast-moving positions.
- pgvector: exact search for small or narrowly filtered sets, HNSW when that is too slow, recall measured against exact search, iterative scans for filtered queries. After trying smaller vectors and index settings, move to a vector database when the index does not fit, needs several machines, or misses the recall you need.
- Unlogged tables serve caches of slow calls but do not relieve the database; materialized views serve totals that may be minutes old; hot counters become appended rows; history uses BRIN and time partitions.
- Streaming replication copies the whole instance to standbys of the same major version. `synchronous_commit` per transaction chooses what a commit waits for; wait for a quorum such as `ANY 1` of two. Read your own writes from the primary or from a standby that has replayed your WAL position. Standby queries conflict with replay; slots keep WAL and need `max_slot_wal_keep_size`.
- PostgreSQL has no built-in failover: use a managed service with high availability turned on, or Patroni with etcd and a watchdog, or a Kubernetes operator, and route clients by role. Rejoin an old primary with `pg_rewind`.
- A standby copies mistakes. Back up with a physical backup and a WAL archive for point-in-time recovery, add `pg_dump` for single databases, alert on failures, and restore on a schedule.
- Logical replication copies chosen tables to a writable server, also on a newer version, without schema changes and sequence values. CDC tools read the same stream through a slot; failover slots need PostgreSQL 17 and setup.
- Apply minor releases soon. Upgrade major versions with `pg_upgrade --link` (a pause of minutes, measured) or logical replication (a shorter pause, with every writer stopped), after testing plans, extensions, and collations.
- Partition large tables that grow and expire by time when that solves a concrete problem, and detach or drop partitions instead of deleting rows. Unique keys must include the partitioning column; partitioning adds no server capacity.
- When one primary is not enough, pick steps by the bottleneck: tune and scale up, move reads to standbys and caches, write less, move independent groups of tables to their own servers, or shard a dominant data set by key with many logical shards or Citus. Data owned by one region can stay on that region's primary; consider leaving PostgreSQL when the same data needs local writes in several regions that one primary cannot serve.

## Sources

- Jimmy Angelakos. [PostgreSQL Mistakes and How to Avoid Them](https://www.manning.com/books/postgresql-mistakes-and-how-to-avoid-them). Manning, 2025. Chapters 3–7, 9, and 10.
- Andrew Atkinson. [High Performance PostgreSQL for Rails](https://pragprog.com/titles/aapsql/high-performance-postgresql-for-rails/). Pragmatic Bookshelf, 2024. Chapters 5, 7, 9–11, 13, and 14.
- Gianni Ciolli, Boriss Mejías, Jimmy Angelakos, Vibhor Kumar, Simon Riggs. [PostgreSQL 16 Administration Cookbook](https://www.packtpub.com/en-us/product/postgresql-16-administration-cookbook-9781835468449). Packt, 2023. Chapters 3, 5, 7, and 9–12.
- Henrietta Dombrovskaya, Boris Novikov, Anna Bailliekova. [PostgreSQL Query Optimization](https://link.springer.com/book/10.1007/979-8-8688-0069-6), 2nd edition. Apress, 2024. Chapters 4, 5, 10, and 11.
- Lukas Fittl. [Effective Indexing in Postgres](https://pganalyze.com/postgres-indexing). pganalyze, 2021. Whole ebook.
- Dimitri Fontaine. [The Art of PostgreSQL](https://theartofpostgresql.com/), 2nd edition. Self-published, 2020. "PostgreSQL Data Types", "Isolation and Locking", and "Listen and Notify".
- Denis Magda. [Just Use Postgres!](https://www.manning.com/books/just-use-postgres) Manning, 2025. Chapters 2, 4–6, and 8–11.
- Josef Machytka. [A deeper look at old UUIDv4 vs new UUIDv7 in PostgreSQL 18](https://www.credativ.de/en/blog/postgresql-en/a-deeper-look-at-old-uuidv4-vs-new-uuidv7-in-postgresql-18/). credativ, 2025.
- Egor Rogov. [PostgreSQL 14 Internals](https://postgrespro.com/community/books/internals). Postgres Professional, 2023. Chapters 3, 5–7, and 9–13.
- Hans-Jürgen Schönig. [Mastering PostgreSQL 17](https://www.packtpub.com/en-us/product/mastering-postgresql-17-9781836205968), 6th edition. Packt, 2024. Chapters 2, 3, 5, 6, 9, and 10.
- Shaun Thomas. [PostgreSQL 12 High Availability Cookbook](https://www.packtpub.com/en-us/product/postgresql-12-high-availability-cookbook-9781838984854), 3rd edition. Packt, 2020. Chapters 4, 7, 8, 10, and 15.
- Bohan Zhang. [Scaling PostgreSQL to power 800 million ChatGPT users](https://openai.com/index/scaling-postgresql/). OpenAI, 2026.
