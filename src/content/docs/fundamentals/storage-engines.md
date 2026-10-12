---
title: Storage engines
description: How a database stores and finds data, from a plain file to LSM-trees, B-trees, and indexes.
---

Every system design has a database box, and inside it a storage engine decides which reads and writes are cheap and what a crash can lose. To choose a database for a workload, you need to know how engines store and find data, and what each choice costs.

## From memory to disk

A URL shortener maps a short code to a long URL. Creating a link stores the pair, and a redirect looks up the code. Redirects far outnumber new links. In SQL terms, a redirect is this query:

```sql
SELECT url
FROM links
WHERE code = ?;
```

The fastest store is a hash map inside the app. It is enough for a throwaway prototype, but a restart wipes the data, and all of it must fit in the server's RAM. Issued links must keep working, so they go to disk.

Each link becomes a record: the code is its key, and the URL is its value. The simplest disk store is a file, and each new record is appended to its end as a line `code,url`. Appending is the cheapest write, since nothing is searched or rewritten. To change a value, append a new record with the same key; the last record for a key wins. A file that only grows at the end is a **log**, and most databases keep one inside.

Reading is the slow part. To find a key, scan the file from the start and keep the last match. For a few thousand records this is fine, but the scan grows with the file.

::diagram{name="log-file"}

A file on one server's disk survives restarts, but a second app server cannot read it. When several servers need the same data, it moves to a separate store that all of them call, for the same reason that [servers stay stateless](../networking/#servers-with-state).

Every redirect scans the whole file, and the file keeps growing.

## Finding a record fast

An **index** removes the scan. It is extra data, built from the records, that says where to find one.

The simplest index, a **hash index**, is a hash map in memory from each key to the byte offset of its latest record in the file. A write appends the record and stores its offset in the map. A read gets the offset and reads one record from disk, and often not even that, because the operating system keeps recently read parts of the file in memory.

::diagram{name="hash-index"}

Any index has a price: it takes space, and every write must update it too. So a store indexes only what its queries need.

A hash index has its own limits. All keys must fit in RAM. The map is lost on restart and is rebuilt by reading the whole file. And a hash map keeps no order, so it finds one key but cannot return a range of keys.

:::do
Use a hash index for lookups by exact key while all keys fit in RAM. When they outgrow RAM, or queries need ranges, the index must keep its keys in order.
:::

Reads are fast now, but the file keeps every old record and only grows.

## Reclaiming space

Each change adds a record, and the old ones stay. To get the space back, the store splits the log into segments: when the current file reaches a size limit, it is closed and a new one starts. Closed segments never change.

In the background, **compaction** reads closed segments, keeps only the latest record for each key, and writes the result to a new segment. Reads keep using the old segments until the new one is ready, then switch to it, and the old files are deleted. The hash index now stores a segment and an offset for each key, and the switch moves its entries to the new places. This background work competes with requests for the disk.

An append-only file cannot erase a record in the middle, so a delete appends a **tombstone**: a record that marks the key as deleted. Compaction then drops the key. The tombstone itself must stay until no older segment holds the key, or the deleted value comes back. Until compaction gets there, deleted data is still on disk, which matters when users ask to remove their data for good.

::diagram{name="compaction"}

Short links often expire. A read hides a record whose time has passed, and compaction removes it later, so expiry costs no write when it happens.

## Surviving a crash

A server can crash in the middle of a write, and the file then ends with half a record. On restart, the store reads the file to rebuild its index and must not trust that half. To detect it, each record starts with its length and carries a checksum of its contents. A record at the end of the file that is too short or fails the checksum is incomplete or damaged, and recovery drops it.

::diagram{name="torn-record"}

Even a complete record may not be on disk yet. A write to a file first lands in the operating system's **page cache** in memory, and the system copies it to disk later. If only the store's process crashes, the page cache keeps the data and it still reaches the disk. If the machine loses power or the operating system crashes, the data is gone. A write is **durable** only after a flush, such as `fsync`, forces it to disk and returns success.

::diagram{name="page-cache"}

For the shortener, a lost write is a short URL that a user has already shared and that now leads nowhere. So the store must choose when to say "ok". It can answer after the flush: nothing it confirmed is lost, but each write waits for the disk, which is much slower than memory. **Group commit** makes this cheaper: the store collects the writes that arrive within a few milliseconds and flushes them together, so the disk does one flush instead of hundreds. The store can also answer before the flush and flush every second or so. Writes return faster, but a power loss erases the writes since the last flush, which the app was told were saved: about a second of them, or more if flushing falls behind.

::diagram{name="ack-timing"}

:::do
Say "ok" for a write only after a durable flush, with group commit to keep it cheap. Answer before the flush only when losing the last moments of writes is acceptable, and state that loss window in the requirements.
:::

## Back to memory

Redirects must be fast: say a redirect may spend a few milliseconds in the store. A store on disk often meets this already: the page cache and the store's own cache keep the most-read parts of its files in memory, so popular records never touch the disk.

The other option is to keep the whole dataset in memory. The estimate decides whether it fits: 100 million links of a few hundred bytes each take tens of gigabytes, which one server's RAM can hold. The store is back to a hash map in memory, and the disk is needed only for recovery.

::diagram{name="memory-options"}

A log records every change, as before, and a **snapshot** saves a full copy of the data now and then, so a restart loads the last snapshot and replays only the log written after it. Such stores are fast mostly because reads use memory structures directly, without decoding pages from disk; the log and snapshots still encode data, but only for recovery. Skipping disk reads matters less, since a disk store with enough memory serves hot data from memory too.

::diagram{name="snapshot-recovery"}

RAM costs much more than disk, and the data needs more of it than its raw size, for the store's own structures and for growth. A restart takes as long as loading all the data back. Durability is a setting, the same choice of when to say "ok":

| Persistence | Lost in a crash or power loss | Use as |
|---|---|---|
| None | Everything | A cache only |
| Snapshots only | Changes since the last snapshot | A main store, if that loss is acceptable |
| Log flushed once a second | About a second of writes, more if flushing falls behind | A main store, if that loss is acceptable |
| Log flushed on every write | Nothing that was confirmed | A main store |

A cache holds only copies of data kept elsewhere. Redis offers all of these settings, so it works as a main store or as a cache. <!-- link: technologies/redis --> Memcached writes nothing to disk and is always a cache. <!-- link: technologies/memcached --> How to put a cache in front of the main store is a topic of its own. <!-- link: fundamentals/caching -->

:::do
Start with a disk store and let its cache hold the hot data. Keep all data in memory when the latency target needs it, and the data, its growth, and the restart time fit the RAM budget.
:::

## Keeping records sorted

The shortener grows to billions of links, and every redirect now records a click: the code, the time, and details such as the country. Clicks arrive by the thousands per second, and a stats page shows the clicks of one link over the last week:

```sql
SELECT time, country
FROM clicks
WHERE code = ?
  AND time >= ?;
```

The hash index fails here twice: billions of keys do not fit in RAM, and a hash map cannot return a range.

Both problems go away if the records in each segment are sorted by key. Here the key is `(code, time)`, so a segment holds all clicks of one code together, ordered by time. A segment sorted by key is an **SSTable** (sorted string table).

Order allows a **sparse index**. The store splits each SSTable into blocks of a few kilobytes and keeps in memory only the first key of each block. To find a key, it takes the block whose first key is the closest one below it, reads that block, and scans it. The index holds one key per block instead of one per record, so it is much smaller and fits in RAM for far more data.

::diagram{name="sparse-index"}

Order also gives ranges. Inside each SSTable, records with nearby keys lie next to each other, so a range of keys, such as the clicks of one link over a week, is read in one pass.

Compaction gets cheaper too. Merging sorted segments is one sequential pass over each of them, like the merge step of merge sort, and the result is sorted as well.

::diagram{name="sstable-merge"}

Writes arrive in any key order, though, and appending to a file cannot keep it sorted.

## Sorting writes in memory

The sorting has to happen before the disk. Each write first goes to a sorted structure in memory, the **memtable**, such as a balanced tree. Inserting into it in any order is cheap, and it always stays sorted. When the memtable reaches a few megabytes, the store writes it out in key order as a new SSTable, in one sequential write, and starts a new memtable.

The memtable lives in memory, so a crash would lose it. To prevent that, each write is first appended to a log on disk and only then added to the memtable. This is the **write-ahead log** (WAL). It serves only to rebuild the memtable after a crash, and the store deletes it once the memtable is on disk as an SSTable. Saying "ok" follows the same rule as before: after the log is flushed.

::diagram{name="lsm-write-path"}

This design, a memtable in front of sorted files that are merged in the background, is the **LSM-tree** (log-structured merge-tree). The disk sees only large sequential writes: the log, the flushes, and compaction. So writes tend to be fast.

::diagram{name="lsm-overview"}

Every flush adds a file, and a read may have to look through many of them.

## Keeping reads cheap

A key can be in the memtable or in any SSTable, and a newer version hides the older ones. So a read checks the memtable first, then the SSTables from newest to oldest, and stops at the first match. That is the basic path; real engines narrow it, for example by skipping files whose key range cannot hold the key. Still, a key that is old or missing makes the read look into many files.

::diagram{name="lsm-read-path"}

A **Bloom filter** next to each SSTable cuts this down. It is a small bit array built from the file's keys, and it answers "definitely not here" or "maybe here". A read asks the filter first and opens only the files that may hold the key. A "maybe" for a key that is not there is a **false positive**, and the read opens that file for nothing; a "no" is never wrong. Filters help lookups by key, not ranges: a range read still merges the matching parts of several files.

::diagram{name="bloom-filter"}

Compaction keeps the number of files down. It merges SSTables in the background, and two strategies trade read cost against write cost. **Size-tiered compaction** merges files of similar size: it rewrites data fewer times, but reads check more files, and merges need more spare disk space. **Leveled compaction** keeps files in levels, and apart from the newly flushed files, the files of one level do not overlap in keys: a lookup by key checks the newly flushed files and at most one file in each other level, and data takes less space, but the same data is rewritten more often.

::diagram{name="compaction-strategies"}

Compaction is also the weak spot. It rewrites the same data several times and competes with requests for the disk. When writes outrun it, files pile up, reads slow down, and in the end the engine slows down or stalls writes, so latency jumps.

:::do
Use an LSM-tree for a sustained heavy load of writes, such as clicks, events, or metrics. Look elsewhere when read cost or compaction stalls hurt more than write speed.
:::

Links are read on every redirect, where a steady lookup time matters more than write speed.

## Updating in place

Links need one sorted structure on disk, so that a read goes straight to its key instead of checking several files. The **B-tree** keeps such a structure and changes it in place.

A B-tree splits the data into fixed-size pages of a few kilobytes and links them into a tree. A leaf page holds a sorted run of keys with their values. A page above the leaves holds keys that divide the range and the numbers of the pages below: keys from `a` to `f` are on page 12, from `g` to `m` on page 40. A lookup starts at the root and follows one page per level down to a leaf. Each page points to hundreds of pages below it, so billions of keys need only three or four levels. The upper levels are read all the time and stay in memory, so a lookup usually costs one or two disk reads, often none.

::diagram{name="b-tree"}

Leaves are kept in key order and point to their neighbors, so a range read finds its first key and walks along the leaves.

A write finds its leaf and changes it in place. When a leaf is full, it splits in two, and its parent gets an entry for the new page. A split can climb up to the root, and the tree stays balanced.

::diagram{name="page-split"}

Changing pages in place is risky. A crash can leave a page half-written, or a split half-done, with a parent pointing to a page that was never written. So a B-tree also keeps a WAL: every change goes to the log, and the log reaches disk before the page it changes. After a crash, the store repairs the pages from the log. Saying "ok" works as before: after the log is flushed, while the changed pages are written later.

::diagram{name="b-tree-wal"}

A B-tree writes to random places on disk, and a change of a few bytes rewrites a whole page. Deletes and splits leave pages partly empty, so the files take more space than the data.

A B-tree is an alternative to the LSM-tree, not an upgrade: they are the two main storage engines, and each one wins on different workloads.

:::do
Use a B-tree for data that is read by key and by range, with a mix of reads and writes. Consider an LSM-tree when measured write load is more than a B-tree keeps up with.
:::

## Choosing an engine

Links are read on every redirect and rarely change. Clicks are written all the time and read in ranges for stats. The engines are compared by **amplification**: how much more the disk reads, writes, or stores than the data the app asked for. The table shows tendencies; the real numbers depend on the workload and the engine's settings.

| | B-tree | LSM-tree |
|---|---|---|
| Read amplification | One path down the tree, steady | May check several files; Bloom filters help reads by key |
| Range reads | Walk along the leaves | Merge the matching parts of several files |
| Write amplification | Log plus a whole page, even for a small change | Log, flush, and every compaction; often lower overall |
| Space amplification | Partly empty pages | Compresses well, but keeps old versions until compaction |
| Latency | Steadier | Spikes when compaction falls behind |

For the shortener, links go to a B-tree. Most relational databases, such as PostgreSQL and MySQL, keep their indexes in B-trees, and MySQL also keeps the rows themselves in the tree of the primary key. <!-- link: technologies/postgresql --> <!-- link: technologies/mysql --> Clicks can live in the same store while their rate is modest. When clicks arrive faster than the B-tree can keep up, they move to an LSM-tree, the engine of Cassandra and RocksDB. <!-- link: technologies/cassandra --> <!-- link: technologies/rocksdb -->

:::interview
When asked to pick a storage engine, start from the access pattern. Reads by key and by range with a mix of writes: a B-tree, the safe default. A sustained heavy load of writes: an LSM-tree, and name its price, slower reads and compaction. Present both as tendencies that depend on the workload, and offer to confirm the choice with a load test of your own reads and writes.
:::

## Searching by other columns

The "My links" page shows a user's latest links:

```sql
SELECT code, url
FROM links
WHERE user_id = ?
ORDER BY created_at DESC
LIMIT 20;
```

The index on `code` cannot find records by `user_id`, so without another index this query reads every record. A **secondary index** fixes this: one more sorted structure, usually a B-tree, ordered by another column. Many records share a value of that column, so each entry holds the value together with the record's key and points back to the record. Depending on the database, it points to the record's place in the table file, or to its primary key, which costs a second lookup.

::diagram{name="secondary-index"}

An index on `user_id` alone finds the matching records, but they still have to be sorted by `created_at`. A **composite index** on `(user_id, created_at)` orders entries by `user_id` and, within each `user_id`, by `created_at`, like a phone book sorted by last name and then by first name. The query finds the newest entry of its `user_id` and walks back 20 entries, without sorting the matching records.

The column order matters. Put the columns compared with `=` first and the column used for sorting or a range last. This index usually cannot help a query by `created_at` alone, just as a phone book does not help find everyone with one first name.

The query still reads each of the 20 records to get `url`. If the index also stores `code` and `url`, it is a **covering index**: the store answers the query from the index without reading the records. The price is a bigger index.

Every index takes space, and every write that changes its columns must update it too. On a table with many writes and few reads, each extra index slows down the main work. A full scan is still the right choice for small tables, or when a query needs most of the rows anyway.

A B-tree keeps values along one sorted line, so it serves equality, ranges, and sorting. Searching an area on a map or a word inside text does not fit one line and needs other index types. <!-- link: patterns/proximity-search --> <!-- link: technologies/elasticsearch -->

:::do
Add the smallest index that serves a frequent query which picks a small share of the rows: columns compared with `=` first, then the sort or range column. Make it a covering index only when reading the records is the proven bottleneck. Check in the query plan that the database uses the index.
:::

## Scanning for analytics

Analysts want totals over all clicks, such as clicks per country per day:

```sql
SELECT country, date(time) AS day, count(*)
FROM clicks
GROUP BY country, day;
```

All the engines so far keep each record whole in one place: **row storage**. It suits the app, which reads and writes a few records at a time by key. This query reads billions of records but needs only two columns out of many, so with row storage the disk reads whole rows and the store throws most of each one away.

**Column storage** keeps the values of each column together, for example one file per column, in the same row order. The query reads only the `country` and `time` columns. Values in a column have one type and often repeat, such as the same country thousands of times, so a column compresses much better than rows, and the disk reads even less.

::diagram{name="row-vs-column"}

The price is on writes. One new row touches every column, so a column store collects new rows in memory and writes them to the columns in batches, much like the memtable. It is also poor at reading or changing single records.

The two workloads have names. **OLTP** (online transaction processing) is the app's work: many small reads and writes by key. **OLAP** (online analytical processing) is the analysts' work: large scans and totals. On one store they compete for the disk, so analytics usually gets its own column store, loaded from the main store in batches or as a stream. Reports may lag behind the app, and the loading method decides by how much.

:::do
Keep the app's records in row storage. Move analytics to a column store when queries scan large parts of the data and reports can tolerate the loading delay.
:::

## Cheat sheet

- Keep data that must survive a restart on disk; a map inside the app fits only a throwaway prototype. Appending to a log is the cheapest write, but reads have to scan it.
- An index speeds up reads but costs space and work on every write, so index only what queries need. A hash index fits lookups by exact key while all keys fit in RAM.
- Split the log into segments and compact them in the background. A delete is a tombstone, and deleted data stays on disk until compaction removes it.
- A write is durable only after a flush to disk. Say "ok" after the flush, with group commit to keep it cheap; answer earlier only with an agreed loss window.
- Start with a disk store whose cache holds the hot data. Keep all data in RAM when the latency target needs it and the data, its growth, and the restart time fit the budget. Without persistence, an in-memory store is only a cache.
- Sorted files (SSTables) allow a sparse index, range reads, and cheap merges.
- An LSM-tree collects writes in a sorted memtable, protects it with a WAL, and flushes it as sorted files.
- LSM reads may check several files: Bloom filters skip files for lookups by key, and compaction keeps the file count down but can fall behind and stall writes.
- A B-tree follows a short path of pages to a key, and cached pages save most disk reads; leaves in key order serve ranges. It rewrites whole pages in random places and protects them with a WAL.
- Pick a B-tree by default for reads by key and by range with a mix of writes. Consider an LSM-tree when measured write load is more than a B-tree keeps up with, and pay for it with read work and compaction. Both are tendencies that depend on the workload.
- Add the smallest index that serves a frequent query which picks a small share of the rows: columns compared with `=` first, then the sort or range column. Make it a covering index only for a proven bottleneck. A full scan is fine for small tables or when most rows match.
- Use row storage for the app's records. Use column storage for large scans and totals when reports can tolerate the loading delay.
