---
title: Redis
description: How Redis keeps data in memory, what each of its data structures and settings costs, and where it stops being safe or enough.
---

Redis is the in-memory store that many designs put next to the main database, for caches, sessions, counters, rankings, queues, and locks. To defend it in a design, know what each structure and setting costs on one server, which confirmed writes it can lose, and when the load needs more servers or a different system.

## Taking hot data off the database

A live streaming service, like Twitch, keeps accounts, channels, follows, and payments in [PostgreSQL](../postgresql/). Every channel page shows the broadcast title, the number of live viewers, and the chat. When a big streamer goes live, hundreds of thousands of viewers open the same page within minutes, and the viewer count changes many times a second.

The database can serve these reads from its cache, but each one is still a query on the one server that also takes every write. The counter is worse: every update of one row waits for the update before it, and each one writes to the log (more on [contention on one row](../../fundamentals/transactions/#contention-on-one-row)). Some data is read again and again, some changes many times a second, and much of it can be rebuilt or lost: a cached page, a session, a viewer count.

**Redis** is a server that keeps all its data in memory, so the dataset must fit in RAM. Every value sits under a key, and the value is a data structure, such as a string, a hash, a list, or a sorted set (more on [choosing a structure](#picking-a-structure-for-each-access)). A client sends commands over TCP, and each command works on a structure inside the server: `GET` reads a cached page, `INCR` adds one to a counter, `ZADD` puts a channel into a ranking.

On a server that is not overloaded, a small command like these takes much less time than the network round trip, which is about 0.2 ms inside a data center ([Redis](https://redis.io/docs/latest/operate/oss_and_stack/management/optimization/latency/)). So a client waits mostly for the network. One thread runs all commands, one after another (more on [one thread](#one-slow-command-blocks-all-clients)). In an example from the Redis benchmark docs, one server with 50 clients that wait for each reply handled about 180,000 `SET` commands per second ([Redis](https://redis.io/docs/latest/operate/oss_and_stack/management/optimization/benchmarks/)), and [sending commands in batches](#paying-for-round-trips) multiplies that.

::diagram{name="redis-time-split"}

Here Redis does not replace the database: accounts and payments stay in PostgreSQL. Redis holds copies and short-lived data next to it, and a write it confirmed can be lost in a [crash](#writing-data-to-disk) or a [failover](#replacing-a-failed-primary), depending on its settings. Each copy also has to be kept in step with the database (more on [updating a cache](../../fundamentals/caching/#updating-the-cache-when-data-changes)). So add Redis when the database cannot keep up with these reads and writes, not before: a few slow or paid lookups fit a [cache table inside PostgreSQL](../postgresql/#caches-counters-and-time-series-inside-postgresql).

::diagram{name="redis-beside-db"}

Since 2024 there are two servers with this core. Redis moved from the BSD license to source-available licenses with version 7.4. In response, the Linux Foundation started **Valkey** ([Linux Foundation](https://www.linuxfoundation.org/press/linux-foundation-launches-open-source-valkey-community)), a fork of Redis 7.2.4, released under BSD, and it stays under BSD ([Valkey](https://valkey.io/topics/migration/)). Redis 8 added the open-source AGPLv3 as a third license option ([Redis](https://redis.io/legal/licenses/)). Both support the same core protocol, data structures, persistence, replication, and sharding, and most client libraries work with both. Since the fork, each adds features on its own, sometimes the same feature under different command names, and Valkey cannot load the data files of Redis 7.4 and later (more on [Redis and Valkey](#choosing-the-server-and-running-it)).

<!-- demo: redis-benchmark with and without pipelining next to pgbench on a one-row counter; redis-cli --latency inside one host and across hosts. -->

:::do
Keep durable business records, such as accounts and payments, in the database. Put data in Redis when it is read on almost every request or changes many times a second, and when losing the latest writes is acceptable or the data can be rebuilt.
:::

## Picking a structure for each access

The channel page reads five things from Redis: the broadcast info (title, game, start time), the viewer count, the last chat messages, the set of moderators, and, on the front page, the live channels ranked by viewers. Each one goes under its own key, and the structure behind the key decides which operations are cheap.

A key is a string, and Redis has no tables or namespaces: the naming scheme takes their place. The common form is `type:id:part`, such as `channel:42:info`. Keys can hold any bytes, but each long key costs memory and time to compare, so hash a long natural key instead of using it as is ([Redis](https://redis.io/docs/latest/develop/using-commands/keyspace/)). The structures that cover most designs:

| Structure | Holds | Cheap operations | In the example |
|---|---|---|---|
| String | Bytes, up to [512 MB](https://redis.io/docs/latest/develop/data-types/strings/) | `GET`, `SET`, `INCR`: O(1) | A rendered page, the viewer count |
| Hash | Fields with string values | `HGET`, `HSET`, `HINCRBY`: O(1) | `channel:42:info` with title and game |
| List | Strings in insertion order | `LPUSH`, `RPOP`: O(1); `LINDEX`: O(N) | The last 100 chat messages |
| Set | Unique strings | `SADD`, `SISMEMBER`: O(1); `SINTER`: grows with the smallest set | The moderators of a channel |
| Sorted set | Unique strings, each with a number (score) | `ZADD`, `ZRANK`: O(log N); `ZRANGE`: O(log N + M) | Live channels by viewer count |
| Stream | An append-only log of entries | `XADD`: O(1); `XRANGE`: grows with the entries returned | "Went live" events |

The costs are for one element: a command with several fields or members pays for each. N is the size of the collection, and M the number of elements returned.

::diagram{name="redis-channel-keys"}

The commands do the work inside the server, so the client sends one short command instead of reading a value, changing it, and writing it back: `HINCRBY` adds to one field, `ZINCRBY` moves a channel up the ranking, and `SINTER` intersects two sets. A list bounded with `LPUSH` and then `LTRIM 0 99` keeps the latest 100 messages and drops the rest ([Carlson](https://www.manning.com/books/redis-in-action)).

An object can be stored three ways. A string holds it as one serialized blob: one read gets it all, but any change rewrites it whole. A hash holds flat fields that can be read and changed one at a time, and since Redis 7.4 and [Valkey 9.0](https://valkey.io/blog/introducing-valkey-9/) each field can have its own expiry. JSON, built into Redis 8 and a module in Valkey, holds nested documents and updates a path inside them, at more memory and CPU than a hash ([Redis](https://redis.io/docs/latest/develop/data-types/compare-data-types/)). Use a string for an object that is read and written whole, a hash for a flat object updated field by field, and JSON for nested data that is read or changed in parts.

::diagram{name="redis-object-three-ways"}

Redis finds a value only by its key. To find channels by game, keep your own index: a set `game:chess:channels` that the app updates together with the channel (more on [several values in one step](#changing-several-values-as-one-step)). When the data needs queries by several fields, use the search indexes that Redis 8 has built in (more on [searching in memory](#searching-data-in-memory)). Extra data about the members of a set or sorted set goes into a hash keyed by the member.

A command that touches every element of a big structure, such as `HGETALL`, `SMEMBERS`, or `LRANGE 0 -1`, takes time in proportion to its size, and other clients wait meanwhile (more on [slow commands](#one-slow-command-blocks-all-clients)). Keep collections bounded with `LTRIM` and `ZREMRANGEBYRANK`, read them in pages, or split them over several keys.

<!-- demo: the channel page as Redis keys: a hash for info, INCR for viewers, LPUSH + LTRIM for chat, a sorted set for the front page; compare MEMORY USAGE and latency of a string blob vs a hash vs JSON for the same object. -->

:::do
Choose the structure by how the data is read and changed. Let a command change the value inside the server instead of reading and writing it from the client, and keep every collection bounded.
:::

## Fitting the data in memory

The service keeps a session for each of 20 million signed-in viewers and a hash for each of a million channels. All of it has to fit in RAM, together with the room that Redis needs to run.

Each key costs more than its bytes: Redis keeps an entry in its key table, an object header for the value, and an entry for the expiry if the key has one. For small values this overhead can be larger than the data, so estimate by loading a sample and reading `MEMORY USAGE` for a few keys and `INFO memory` for the total, instead of adding up raw sizes.

Small collections use much less memory: a hash or a sorted set below a size limit is stored as one compact array instead of a table with pointers. By default a hash stays compact up to 512 fields, with field names and values up to 64 bytes, and a sorted set up to 128 members of up to 64 bytes. A list is a chain of such compact arrays of about 8 KB each ([Redis](https://github.com/redis/redis/blob/8.10/redis.conf)). Compact encoding uses up to ten times less memory, five times less on average ([Redis](https://redis.io/docs/latest/operate/oss_and_stack/management/optimization/memory-optimization/)). The price is CPU: a lookup inside the array scans it, so raising the limits a lot makes access slow.

::diagram{name="redis-compact-encoding"}

This allows a trick for many small values. Instead of one key per channel, put up to a few hundred channels into one hash: `channel:42017` becomes field `17` of key `channels:420`. In one test, 370,000 city records took 44 MB in one big hash and 12 MB in hashes split this way ([Carlson](https://www.manning.com/books/redis-in-action)). The app maps IDs to buckets itself, and before Redis 7.4 the fields could not have their own TTL. For yes-or-no facts about users with dense numeric IDs, a bitmap stores one bit per user: 100 million users take 12 MB ([Redis](https://redis.io/docs/latest/operate/oss_and_stack/management/optimization/memory-optimization/)).

::diagram{name="redis-hash-buckets"}

Size the server above the data itself:

- Saving to disk forks the process, and every page that changes during the save is copied (more on [saving to disk](#writing-data-to-disk)). With heavy writes, this copy can approach the size of the data.
- Replication buffers and buffers for slow clients hold memory outside the data (more on [copies](#keeping-a-copy-on-another-server)).
- Memory freed by deleted keys often stays with the process, so size for the peak, not for the average ([Redis](https://redis.io/docs/latest/operate/oss_and_stack/management/optimization/memory-optimization/)).

One book suggests keeping the data at 50–65% of the server's RAM to leave room for the save and the buffers ([Carlson](https://www.manning.com/books/redis-in-action)). Treat it as a starting point and check the peak under load. Valkey 9.1 cut the overhead of each key further, by up to 44% of the overhead of small strings ([Valkey](https://valkey.io/blog/9.1-memory-efficiency/)).

::diagram{name="redis-memory-headroom"}

<!-- demo: load 1 million small keys, then the same data as hashes of 500 fields; compare INFO memory; raise hash-max-listpack-entries and measure HGET latency; watch used_memory_rss during BGSAVE under writes. -->

:::do
Estimate memory from a measured sample, not from raw sizes. Group many tiny values into hashes or bitmaps, keep compact limits near their defaults, and leave headroom for saving to disk and for buffers.
:::

## One slow command blocks all clients

A moderator tool lists all viewers of a big channel with `SMEMBERS` on a set of half a million members. While Redis builds the reply, chat messages, viewer counts, and page reads from every other client wait.

Redis runs commands on one thread, one after another. So no command of another client runs in the middle of an `INCR`, and many app servers can update one counter without any coordination of their own. It also means that a command which touches N elements holds up everyone for the time it takes. The usual culprits are `KEYS`, which walks the whole key space, full reads of big collections, set operations on big sets, and `DEL` of a big key, which frees its memory before it returns ([Redis](https://redis.io/docs/latest/operate/oss_and_stack/management/optimization/latency/)). A long Lua script, a program that runs inside the server, blocks it the same way (more on [scripts](#changing-several-values-as-one-step)).

The fixes:

- Iterate with `SCAN`, `SSCAN`, `HSCAN`, and `ZSCAN`. Each call does a bounded amount of work and returns a cursor and some elements; `COUNT` is a hint, not a page size, and a call may return none. Continue until the cursor is 0. A full pass returns every element that existed for the whole pass, and may return some of them twice ([Redis](https://redis.io/docs/latest/commands/scan/)).
- Delete big keys with `UNLINK`, which frees the memory in a background thread.
- Keep collections bounded, and run slow reads that can be a moment old on a replica, a copy of the server (more on [copies](#keeping-a-copy-on-another-server)).

::diagram{name="redis-slow-command"}

To find slow commands, read `SLOWLOG`: by default it keeps the last 128 commands that took longer than 10 ms ([Redis](https://github.com/redis/redis/blob/8.10/redis.conf)). One core at 100% while the request rate is normal is another sign.

Since Redis 6, I/O threads can read and write sockets and parse requests, while the commands still run on the main thread. They are off by default and pay off on servers with four or more cores. In the Redis 8 announcement, 8 I/O threads gave up to 112% more throughput ([Redis](https://redis.io/blog/redis-8-ga/)), and Valkey 8 reached 1.2 million requests per second on one server, against 380,000 before its threading changes ([Valkey](https://valkey.io/blog/valkey-8-0-0-rc1/)). These are vendor numbers. I/O threads raise the ceiling for many small commands. A single slow command still blocks everyone.

::diagram{name="redis-io-threads"}

When the main thread itself is full, one server is the limit. Stripe ran its rate limiters on one Redis server and saw a single core pinned at 100% and a steady rate of timeouts. Moving to a cluster of 10 servers removed the errors, with little effect on latency ([Stripe](https://brandur.org/redis-cluster), 2018). To use more cores, run more Redis processes and spread the keys over them (more on [many servers](#spreading-data-over-many-servers)).

<!-- demo: SMEMBERS on a 500k set and DEL of a big hash while redis-benchmark runs; watch latency spikes with redis-cli --latency; repeat with SSCAN and UNLINK; read SLOWLOG. -->

:::avoid
Running `KEYS` in production. It reads every key in one command and stops all other clients until it ends. Use `SCAN`.
:::

## Paying for round trips

The front page shows the viewer counts of 50 channels, and going live sets the broadcast info, adds the channel to the ranking, and resets its counters. Sent one by one, each command waits for the reply of the one before.

A small command takes far less time on the server than its reply takes to cross the network. At a round trip of 0.2 ms, one client that waits for each reply sends at most about 5,000 commands per second, however fast the server is; across regions, at 50 ms, it sends 20. In one test on a 1 Gbit/s network with a 0.27 ms round trip, a five-command update ran 739 times per second one command at a time and 2,841 times per second when the five were sent together ([Carlson](https://www.manning.com/books/redis-in-action)).

Three ways to pay fewer round trips, in order of preference ([Redis](https://redis.io/docs/latest/operate/oss_and_stack/management/optimization/latency/)):

1. One command for many values: `MGET` reads the 50 counters at once, and `HMGET` reads several fields of one hash. For writes, `MSET`, `HSET` with several fields, and `SADD` with several members do the same.
2. **Pipelining**: the client sends many commands without waiting, then reads all the replies. It also saves the server a system call per command, so throughput can grow up to about ten times ([Redis](https://redis.io/docs/latest/develop/using-commands/pipelining/)). The server keeps the replies in memory until the client reads them, so send large jobs in batches, for example of 10,000 commands.
3. A script, when a command needs the result of the one before it (more on [scripts](#changing-several-values-as-one-step)).

::diagram{name="redis-round-trips"}

A pipeline is not a transaction: commands of other clients can run between its commands, and if the client fails halfway, the first part is already applied.

Connections cost too. Opening a connection for each command can cut throughput to a quarter or less, so keep long-lived connections in your client's pool, or share them through its multiplexer ([Carlson](https://www.manning.com/books/redis-in-action)). Give blocking reads, such as a worker waiting for a job, and transactions their own connection, since they hold it while they wait. Many idle connections are not free either: in the Redis benchmark, a server with 30,000 connections handled half the throughput of one with 100 ([Redis](https://redis.io/docs/latest/operate/oss_and_stack/management/optimization/benchmarks/)).

<!-- demo: 50 GET vs one MGET vs a pipeline of 50, on localhost and with 1 ms and 50 ms of added latency (tc netem); redis-benchmark -P 1 vs -P 16. -->

:::do
Read and write related values with one multi-key command or a pipeline. Reuse long-lived connections, and move logic that needs a reply before the next command into a script.
:::

## Changing several values as one step

The chat lets a viewer send at most 5 messages in 10 seconds. The check reads a counter, compares it with the limit, and adds one; two app servers that serve the same viewer can both read 4 and both let a message through. Ending a broadcast must remove the channel from the ranking, delete its viewer count, and add an event, all together.

**MULTI and EXEC** wrap commands into a transaction: Redis queues them and, at `EXEC`, runs them in a row with no command of another client in between. If the client disconnects before `EXEC`, nothing runs. There is no rollback: a command with a syntax error makes `EXEC` refuse the whole transaction, but a command that fails while running, for example on a key of the wrong type, fails alone and the others stay applied ([Redis](https://redis.io/docs/latest/develop/using-commands/transactions/)). The client gets the results only after `EXEC`, so it cannot use one result to decide what to queue next: a transaction alone cannot "check, then act".

::diagram{name="redis-exec-no-rollback"}

`WATCH` adds that check. The client watches a key, reads it, and queues the change; if another client changed the key before `EXEC`, `EXEC` returns nothing and the client retries. This optimistic approach works while conflicts are rare. On one busy key it collapses: in a test with five buyers and five sellers on one market key, clients completed fewer than 600 purchases with 161,000 retries, while locks on single items completed 111,000 purchases with none ([Carlson](https://www.manning.com/books/redis-in-action)).

::diagram{name="redis-watch-retry"}

A **Lua script** runs on the server as one command: it can read, decide, and write, and nothing else runs until it ends. One script checks the chat limit and adds one in a single round trip. Like a transaction, it has no rollback: if it fails after a write, that write stays, so check inputs and key types before changing anything. Uber caches database rows in Redis and writes them with a script that compares the row's timestamp with the cached one, so that an older row never replaces a newer one ([Uber](https://www.uber.com/us/en/blog/how-uber-serves-over-40-million-reads-per-second-using-an-integrated-cache/), 2024). The rules for scripts:

- A script blocks the server like a slow command. After 5 seconds by default, Redis answers other clients with a busy error. A script that has not written yet can be killed; one that has written can only be stopped by shutting down without saving ([Redis](https://redis.io/docs/latest/develop/programmability/eval-intro/)).
- Pass the names of all keys the script touches in its list of keys, separately from its other arguments. Redis needs them to route the script in a cluster (more on [many servers](#spreading-data-over-many-servers)).
- Redis caches scripts sent with `EVAL`, but the cache can lose them at any time: on a restart, a failover, `SCRIPT FLUSH`, or, since Redis 7.4, when it evicts old scripts. A client that calls a script by its hash must send the script again when Redis answers `NOSCRIPT`. **Redis functions**, since Redis 7.0, are named scripts that Redis stores and copies with the data ([Redis](https://redis.io/docs/latest/develop/programmability/functions-intro/)).

::diagram{name="redis-check-race"}

Many such scripts are now single commands. `SET` with `NX` writes only if the key is absent, and with `IFEQ` only if the current value matches, which is a compare-and-set without a script (Redis 8.4, [Valkey 8.1](https://valkey.io/blog/valkey-8-1-0-ga/)) ([Redis](https://redis.io/docs/latest/commands/set/)). Redis 8.8 added `INCREX`, which adds to a counter with an upper bound and an expiry in one command, the core of a rate limit ([Redis](https://redis.io/docs/latest/commands/increx/)). The limit algorithms themselves are a topic of their own. <!-- link: patterns/rate-limiting --> A change that fits one hash, such as `HSET` of several fields, is already atomic, so keeping values that change together in one key avoids transactions altogether.

A lost reply does not mean that a command failed: an `INCR` may have run before the connection broke, so retry only what is safe to repeat (more on [failed calls](../../fundamentals/networking/#when-a-call-fails)). These steps hold only inside one Redis server. They do not make Redis and the database change together (more on [atomic changes](../../fundamentals/transactions/#changing-several-rows-at-once)).

<!-- demo: a chat rate limit as GET + INCR (race under load), MULTI with WATCH (retries), a Lua script, and INCREX; count wrong answers and retries. -->

:::do
Put values that change together into one key when you can. Use a script or a single conditional command for "check, then write", `WATCH` only when conflicts are rare, and `MULTI` for a group of writes that must not interleave with other clients.
:::

## Letting data expire

A session should disappear after 30 days without visits, a cached page after five minutes, and a viewer's "watching" mark a minute after the player stops sending heartbeats.

Each key can have a TTL: `SET` with `EX`, or `EXPIRE` on an existing key. Redis stores the moment of expiry as an absolute time, so it follows the server's clock; moving the clock forward expires keys early ([Redis](https://redis.io/docs/latest/commands/expire/)). A command that replaces the value, such as `SET`, removes the TTL, while a command that changes the value in place, such as `INCR`, `LPUSH`, or `HSET`, keeps it. A cached page rewritten with a plain `SET` becomes permanent, so when you replace a short-lived value, give it its expiry again or keep the old one with `KEEPTTL`. Fields of a hash can expire on their own since Redis 7.4 and Valkey 9.0.

::diagram{name="redis-ttl-reset"}

An expired key is never returned, but its memory is freed later. Redis deletes a key when a command touches it, and a background cycle, about ten times a second, samples keys that have a TTL and deletes the expired ones. While many keys in the samples turn out to be expired, it keeps sampling, until it runs out of its time budget. When a large share of keys expires in the same second, for example a million "watching" marks set with one expiry time at the end of a tournament, this cleanup takes CPU from commands and raises latency ([Redis](https://github.com/redis/redis/blob/8.10/src/expire.c)). The same moment empties the cache for all those keys at once (more on [many misses at once](../../fundamentals/caching/#many-misses-at-once)). Add a random spread to TTLs that would otherwise end together.

::diagram{name="redis-expire-cycle"}

A sliding expiry, where each visit moves the session's end forward, turns every read into a write that goes to replicas and to disk. Refresh it only when several minutes have passed since the last refresh. Replicas do not delete expired keys themselves: they wait for the delete from the server they copy, and until then hide expired keys from reads.

Redis can send an event when it deletes an expired key, but it fires when the deletion happens, not at the exact expiry time, so it is not a timer for jobs ([Fugaro and Ortensi](https://www.packtpub.com/en-us/product/redis-stack-for-application-modernization-9781837638185)). <!-- link: patterns/job-scheduling -->

<!-- demo: set 1 million keys with one EXPIREAT and measure latency at that second, then with jitter; show SET dropping a TTL and KEEPTTL keeping it. -->

:::do
Give every copy and every short-lived value a TTL, and set it again or keep it with `KEEPTTL` when you replace the value. Spread TTLs that would end together, and do not use expiry events as timers for work.
:::

## When memory runs out

A big tournament doubles the number of live channels, and the cache grows with them until Redis reaches the memory of its server.

By default Redis has no memory limit: it grows until the operating system starts swapping its pages to disk, which makes every command slow, or kills the process. Set `maxmemory` below the RAM, leaving room for saving to disk and for buffers (more on [fitting in memory](#fitting-the-data-in-memory)). The buffers that hold writes for replicas and for the log on disk are not counted in `maxmemory`, and the process can use more memory than the limit, so this room is needed even with the limit set; `mem_not_counted_for_evict` in `INFO memory` shows those buffers ([Redis](https://redis.io/docs/latest/develop/reference/eviction/)).

At the limit, the eviction policy decides what happens to a write that needs more memory:

| Policy | At the limit | Fits |
|---|---|---|
| `noeviction` (default) | Writes that add data fail with an error; reads work | Data that must not vanish: sessions kept only here, queues |
| `allkeys-lru` | Drops the key that was used longest ago | A cache, as the default choice |
| `allkeys-lfu` | Drops the key used least often, with counts that fade over time | A cache where popularity is stable and one-off reads would push out hot keys |
| `volatile-lru`, `volatile-lfu` | The same as LRU and LFU, but only among keys with a TTL | One server for a cache with TTLs and data without them |
| `volatile-ttl` | Drops the key with a TTL that expires soonest | Keys whose TTL marks how long they are worth keeping |
| `allkeys-random` | Drops a random key | Keys read about equally often |

Redis does not track exact use: it samples five keys and drops the best candidate among them, and ten samples come very close to exact LRU ([Redis](https://redis.io/docs/latest/develop/reference/eviction/)). Redis 8.6 added LRM policies, which count only writes as use. The `volatile-*` policies behave like `noeviction` when no key has a TTL, and a cache key written without a TTL by mistake can never be evicted. Redis's own advice is to run two servers instead: one cache with `allkeys-lru` and one store with `noeviction`.

::diagram{name="redis-volatile-trap"}

Eviction is fine for copies and harmful for data kept only in Redis: an evicted session logs a viewer out. Watch the hit ratio and the count of evicted keys together (more on [choosing what to drop](../../fundamentals/caching/#choosing-what-to-drop-when-memory-is-full)). Replicas do not evict by themselves: they apply the primary's deletions, so give them the same memory as the primary.

<!-- demo: fill a server past maxmemory under noeviction (OOM errors), allkeys-lru, and volatile-lru with keys without TTL; watch evicted_keys and the hit ratio. -->

:::do
Always set `maxmemory`. Use `allkeys-lru` for a cache and `noeviction` for data kept only in Redis, on separate servers, and alert on evictions in the store and on a falling hit ratio in the cache.
:::

## Counting and ranking

The channel page shows how many viewers watch right now, the broadcast summary shows how many different viewers came today, and the front page ranks live channels by viewers.

`INCR`, `INCRBY`, and `HINCRBY` change a counter atomically in one command, so many app servers can count the same thing without locks. A popular channel turns its counter into one very busy key; adding up increments in each app server and sending them once a second cuts the writes to one per server (more on [a hot key](#one-key-hotter-than-the-rest)). For counts per minute or per hour, keep one hash per counter with a field per time bucket, and let old fields expire.

"Watching right now" needs to forget viewers who left without saying so. A sorted set per channel can hold the viewer as member and the Unix time of the last heartbeat as score: `ZADD` updates the score, `ZREMRANGEBYSCORE` removes members older than a cutoff, and `ZCARD` gives the count. It holds one member per viewer, so a channel with half a million viewers keeps half a million members in memory. How to track presence at scale is a topic of its own. <!-- link: patterns/real-time -->

::diagram{name="redis-heartbeats"}

"Different viewers today" with a set of viewer IDs is exact, but it grows with every viewer. A **HyperLogLog** estimates the number of distinct items in at most 12 KB per key, with a standard error of 0.81% ([Redis](https://redis.io/docs/latest/develop/data-types/probabilistic/hyperloglogs/)). `PFADD` adds a viewer and `PFCOUNT` returns the estimate. Daily counts cannot be added up into a weekly one, since a viewer who came every day would count seven times; `PFMERGE` merges the daily keys into a weekly estimate instead ([Fugaro and Ortensi](https://www.packtpub.com/en-us/product/redis-stack-for-application-modernization-9781837638185)).

::diagram{name="redis-set-vs-hll"}

A sorted set keeps members ordered by score, so it is a ranking: `ZINCRBY` changes a channel's score, `ZREVRANGE live 0 9` returns the top ten, and `ZREVRANK` the position of one channel, each in O(log N) time plus the members it returns. Members with equal scores are ordered by their bytes. Keep the set bounded, for example with `ZREMRANGEBYRANK`, and remove channels that went offline.

::diagram{name="redis-ranking"}

Redis 8 also has built-in structures for counts that may be approximate: Top-K for the most frequent items, Count-Min sketch for the frequency of each item, and Bloom filters for "seen before" checks. Valkey provides Bloom filters as a module. How to combine these into counters at scale is a pattern of its own. <!-- link: patterns/counting -->

<!-- demo: viewers right now with a heartbeat sorted set; unique viewers with SADD vs PFADD (memory and error on 1 million IDs); PFMERGE of seven days; a live ranking with ZINCRBY. -->

:::do
Use `INCR` for exact counters, a sorted set of heartbeats for "online now", HyperLogLog for distinct counts that may be off by about one percent, and a bounded sorted set for rankings.
:::

## Pushing events to connected servers

Viewers' chat connections are spread over 200 app servers. A message sent to a channel must reach every server that holds a viewer of that channel, at once.

**Pub/Sub** delivers each message to the clients subscribed to its channel at that moment. Each app server subscribes to the channels its viewers watch, over one connection per Redis server, not one per chat channel, and `PUBLISH` sends a message to all of them; `PSUBSCRIBE` subscribes to a pattern of names. Redis stores nothing: delivery is at most once, and a server that was disconnected for a second has lost that second's messages for good ([Redis](https://redis.io/docs/latest/develop/pubsub/)). After a reconnect, it reloads the recent history from a list or a stream (more on [work that survives a worker crash](#handing-out-work-that-survives-a-worker-crash)).

::diagram{name="redis-pubsub-fanout"}

A subscriber that reads slower than messages arrive fills its output buffer on the Redis server. By default Redis disconnects it when the buffer passes 32 MB, or stays above 8 MB for a minute ([Redis](https://github.com/redis/redis/blob/8.10/redis.conf)). The subscriber then misses messages, as with any other disconnect.

In a cluster, `PUBLISH` sends each message to every node, so the work grows with the number of nodes instead of spreading over them. Figma moved its pub/sub load to a clustered Redis service, and a few weeks later one node stayed at 100% CPU; the cause was a bug in how the cluster's internal links buffer these messages, and the fix was to move pub/sub off the cluster ([Figma](https://www.figma.com/blog/postmortem-service-disruptions-on-june-6-and-7-2022/), 2022). **Sharded Pub/Sub** (`SPUBLISH`, `SSUBSCRIBE`, since Redis 7.0) maps each channel to a slot, like a key (more on [slots](#spreading-data-over-many-servers)), and keeps its messages within the shard that owns it: its primary and its replicas. Adding shards adds capacity. It has no pattern subscriptions, and the client must support it ([Redis](https://redis.io/docs/latest/develop/pubsub/)). How to route messages to millions of connections is a topic of its own. <!-- link: patterns/real-time -->

::diagram{name="redis-publish-vs-spublish"}

<!-- demo: two app servers in a chat over Pub/Sub; kill one subscriber's connection and show lost messages; a slow subscriber hitting the 32 MB limit; PUBLISH vs SPUBLISH load on a 6-node cluster. -->

:::tradeoff
Pub/Sub adds almost no delay and keeps no state, so it is cheap. In return, any message sent while a subscriber is away or too slow is lost, and the sender never learns about it.
:::

## Handing out work that survives a worker crash

When a big streamer goes live, two million viewers who follow the channel must get a notification. The app splits them into jobs of a thousand viewers each, and a pool of workers sends them. A worker can crash in the middle of a job, and the job must then go to another worker.

A list is the simplest queue: the app pushes jobs with `LPUSH`, and workers wait for them with `BRPOP`. The pop removes the job, so a worker that crashes after the pop loses it. A safer form moves the job atomically to the worker's own processing list with `BLMOVE` and deletes it there when done; a separate check returns jobs that stayed in a processing list too long. A sorted set scored by start time can hold delayed jobs ([Carlson](https://www.manning.com/books/redis-in-action)). <!-- link: patterns/job-scheduling -->

::diagram{name="redis-list-queues"}

A **Redis stream** is an append-only log in one key. `XADD` appends an entry, and Redis gives it an ID made of the time in milliseconds and a sequence number. A **consumer group** shares the entries among its workers: `XREADGROUP` hands each new entry to one worker and keeps it in the group's list of pending entries until the worker confirms it with `XACK`. Entries of a worker that went silent stay pending; `XAUTOCLAIM` reassigns those idle longer than a set time to another worker. Each entry counts its deliveries, so an entry that has failed many times can be moved to a separate stream for people to look at ([Redis](https://redis.io/docs/latest/develop/data-types/streams/)). This is at-least-once delivery: a job can run twice, so the handler must be safe to repeat. <!-- link: fundamentals/messaging -->

::diagram{name="redis-consumer-group"}

Several groups can read the same stream, each getting every entry: the notifier and the analytics job each keep their own position.

::diagram{name="redis-stream-groups"}

A stream holds its entries until they are trimmed, by length with `XADD ... MAXLEN ~ 1000000`, where `~` lets Redis cut whole internal blocks cheaply, or by ID with `MINID`. To keep a time window, turn the cutoff time into an ID: IDs start with the time. Trimming does not wait for the groups: it can delete entries that no worker has processed yet, and a pending entry then has no data to retry. Keep enough history for the slowest group and watch its lag, or, since Redis 8.2, trim with `ACKED` to delete only entries that every group has acknowledged; then a stuck group stops the trimming. Since Redis 8.6, `XADD` can drop an entry that a producer sends twice after a retry. The producer passes a stable producer ID and, with `IDMP`, the same message ID on every retry; with `IDMPAUTO`, Redis derives the message ID from the content. Redis remembers these IDs only for a set time, 100 seconds by default, and a set number per producer, so size both for the longest retry ([Redis](https://redis.io/docs/latest/develop/data-types/streams/idempotency/)). The handlers on the other side still run at least once.

A stream is not a distributed log. It is one key on one server, so its throughput and size are limited by that server and its memory: to spread the load, split it into several streams, for example by viewer ID. It is only as safe as Redis's saving and copying: a failover can lose entries that were acknowledged (more on [losing writes in a failover](#replacing-a-failed-primary)). In a test on a slow machine of its time, 99.9% of entries reached a consumer within 2 ms, and `XADD` with pipelining reaches half a million to a million entries per second ([Redis](https://redis.io/docs/latest/develop/data-types/streams/)). Use a log or a broker built for it when the history to keep does not fit in RAM, partitions must scale on their own, or the work must survive a failover of Redis. <!-- link: technologies/kafka --> <!-- link: technologies/rabbitmq --> Jobs that must be created in the same transaction as the business data fit a job table in the database better (more on [jobs in PostgreSQL](../postgresql/#running-background-jobs-without-a-broker)).

<!-- demo: a notification queue as a list (kill a worker after BRPOP, the job is lost), with BLMOVE, and as a stream with a consumer group, XAUTOCLAIM, and a dead-letter stream. -->

:::do
Use a stream with a consumer group for jobs that must survive a worker crash, make every handler safe to run twice, and trim only what all groups have processed. Use a plain list only for jobs you can afford to lose, and a dedicated log or broker when the history outgrows RAM or the work must survive a failover of Redis.
:::

## Letting one worker act at a time

When a broadcast ends, a worker gets the job to build its highlights video. The worker pauses for a while, the job goes to a second worker, and now both may build the same video. When a channel's cached page expires, only one app server should rebuild it from the database.

A lock in Redis is a key that only one client can create:

```text
SET lock:highlights:42 7f3a9c NX PX 30000
```

`NX` writes the key only if it does not exist, and `PX 30000` deletes it after 30 seconds, so the lock frees itself if its holder dies. The value is a random token of the holder. Release the lock only if the key still holds your token: `DELEX` with `IFEQ` in Redis 8.4, `DELIFEQ` in Valkey 9.0, or a short script on older versions ([Redis](https://redis.io/docs/latest/develop/clients/patterns/distributed-locks/)). A plain `DEL` can remove a lock that another worker took after yours expired.

::diagram{name="redis-lock-token"}

The expiry is also the weak spot. If the holder stops for longer than the TTL, for a garbage collection pause or a slow network call, the lock expires and a second worker takes it while the first still works. A long job extends its lock while it runs, only if the key still holds its token, in one conditional command or script, and stops when the extension fails; a pause can still outlast the extension. A failover breaks the lock too: the primary confirms the key, dies before a replica gets it, and the promoted replica lets a second worker take the same lock ([Redis](https://redis.io/docs/latest/develop/clients/patterns/distributed-locks/)).

::diagram{name="redis-lock-failover"}

Redlock, proposed by the author of Redis, takes the lock on a majority of five independent servers to survive a failure. Martin Kleppmann argued that its safety depends on timing assumptions and that it gives no number that the protected resource can check, so it is not safe for correctness ([Kleppmann](https://martin.kleppmann.com/2016/02/08/how-to-do-distributed-locking.html)); Salvatore Sanfilippo answered that the algorithm checks the elapsed time and is safe under bounded clock drift ([Sanfilippo](https://antirez.com/news/101)). The practical rule follows from what a double holder costs (more on [letting only one node act](../../fundamentals/consistency/#letting-only-one-node-act)): a lock that only saves duplicate work, like the highlights video, is fine on one Redis key; a lock that protects data from corruption needs a consensus store and a check at the resource, or a lock in the database that holds the data (more on [locks in PostgreSQL](../postgresql/#concurrent-writes-the-postgresql-way)). <!-- link: patterns/distributed-locks -->

<!-- demo: two workers with SET NX PX; pause one past the TTL (kill -STOP) and show both inside; release with DEL vs DELEX IFEQ. -->

:::do
Use a Redis lock to avoid duplicate work, with a random token, an expiry, and a release that checks the token. When two holders would corrupt data, use a consensus store with fencing tokens, or the database's own locks.
:::

## Searching data in memory

Viewers search live channels by words in the title and filter by game and language. A "near you" shelf shows broadcasts from the viewer's city, and a recommendation shelf shows broadcasts similar to the one being watched.

Redis Search, built into Redis 8, keeps secondary indexes over hashes or JSON documents whose keys start with a given prefix. An index lists the fields and their types: TEXT for words, TAG for exact values such as a game, NUMERIC for ranges, GEO for places, and VECTOR for embeddings. Redis updates the index on every write to an indexed key, so a search sees the new and changed documents, and both the index and the writes cost memory and CPU on the same server. A new index fills with the existing documents in the background, and a document whose fields do not fit the schema is not indexed, so check `FT.INFO` for progress and errors. `FT.SEARCH` runs a query, and `FT.AGGREGATE` groups and counts results, for example the number of live channels per game. An existing index can only gain fields; to change one, build a new index, wait until it is filled, and switch an alias to it ([Fugaro and Ortensi](https://www.packtpub.com/en-us/product/redis-stack-for-application-modernization-9781837638185)). In a cluster, each shard indexes its own keys, and a query asks every shard. Valkey offers Valkey Search as a module, built first for vectors and extended to text, tags, and numbers in version 1.2 ([Valkey](https://valkey.io/blog/valkey-search-1_2/)).

::diagram{name="redis-search-index"}

Without the search module, Redis still has geo commands. `GEOADD` stores points in a sorted set, with the score encoding the position as a geohash, and `GEOSEARCH` finds members within a radius or a box: it reads the geohash areas around the point and then checks the exact distance ([Redis](https://redis.io/docs/latest/develop/data-types/geospatial/)). Updating a position is one `GEOADD`, so it suits objects that move. <!-- link: patterns/proximity-search -->

::diagram{name="redis-geosearch"}

Vector search compares an embedding of the current broadcast with the embeddings of others. The embeddings come from a model outside Redis. A FLAT index compares the query with every vector and is exact; an HNSW index walks a graph, finds most nearest neighbors much faster, and may miss some. A query can filter by tags or numbers first, for example only broadcasts in the viewer's language ([Fugaro and Ortensi](https://www.packtpub.com/en-us/product/redis-stack-for-application-modernization-9781837638185)). Redis 8 also has vector sets, a separate structure for the same task. <!-- link: patterns/vector-search -->

All of this lives in RAM next to everything else in the server. It fits when the data is already in Redis, fits in memory, and needs filters and short answers. When the data lives in PostgreSQL and search is a small part of the load, search it there (more on [search in PostgreSQL](../postgresql/#searching-by-words)). Redis Search has stemming, fuzzy and prefix matching, scoring, and aggregations; use a separate search engine when the index outgrows memory, when the needed analyzers, ranking, or aggregations go beyond Redis Search, or when search must scale apart from the rest of Redis. <!-- link: technologies/elasticsearch -->

<!-- demo: an index over channel hashes (TEXT title, TAG game and language, NUMERIC viewers); search and facet counts; GEOSEARCH by city; KNN over 10,000 embeddings with FLAT vs HNSW and a TAG filter. -->

:::do
Search inside Redis when the data is already there and fits in memory. Index only the fields that queries use, and move to a search engine when the index outgrows RAM or search quality needs more than filters and simple relevance.
:::

## Writing data to disk

Redis restarts after a kernel update. Sessions and the live ranking should come back; the cache may start empty, but then every read goes to the database at once (more on [losing the cache](../../fundamentals/caching/#losing-the-cache)).

Redis has two ways to keep data on disk, and they map to the general choices of an in-memory store (more on [keeping data in memory](../../fundamentals/storage-engines/#back-to-memory)):

- An **RDB snapshot** (Redis Database file) holds the whole dataset at one moment. Redis forks, and the child process writes the file while the parent goes on serving. By default it saves after an hour with one change, after 5 minutes with 100 changes, or after a minute with 10,000 changes ([Redis](https://github.com/redis/redis/blob/8.10/redis.conf)). A crash loses everything written since the last snapshot, usually minutes. The file is compact, loads fast, and is the natural backup.
- The **AOF** (append-only file) is a log of every write command. With `appendfsync everysec`, a background thread flushes it about once a second, so a crash of the machine usually loses about the last second; a crash of the Redis process alone loses nothing that reached the operating system. With `always`, Redis flushes before it replies, grouping the writes of many clients into one flush. With `no`, the operating system flushes when it likes, on Linux about every 30 seconds ([Redis](https://redis.io/docs/latest/operate/oss_and_stack/management/persistence/)). The log is compacted in the background by a rewrite, which forks too.

The AOF is off by default, so a default Redis can lose minutes of writes. On a laptop benchmark with pipelining, `everysec` handled 118,483 `SET` commands per second with a p99 of 41 ms, and `always` handled 15,340 with a p99 of 65 ms ([Fugaro and Ortensi](https://www.packtpub.com/en-us/product/redis-stack-for-application-modernization-9781837638185)). Redis's own advice is to turn on both for a safety close to PostgreSQL's, or to use snapshots alone if a few minutes of loss is acceptable; on restart, Redis loads the AOF, the more complete of the two.

::diagram{name="redis-rdb-vs-aof"}

A fork copies the process's page table, and the server stops while it does. Measurements in the Redis docs, from older hardware, range from about 10 ms per GB of data on physical machines to about 240 ms per GB on old Xen-based cloud instances ([Redis](https://redis.io/docs/latest/operate/oss_and_stack/management/optimization/latency/)), so a large server can pause for a noticeable time. Measure it on your own servers: `INFO` reports the last fork time in `latest_fork_usec`. After the fork, every page the parent changes is copied, so a busy server needs memory for those copies (more on [fitting in memory](#fitting-the-data-in-memory)). Turn off transparent huge pages in Linux: with them, a few writes copy most of the memory and the latency jumps.

::diagram{name="redis-fork-cow"}

When a save fails, for example on a full disk, Redis by default refuses writes until a save succeeds, so alert on failed saves and AOF writes. A restart reads the whole dataset back into memory before Redis serves it, so a large server comes back slowly. Copy snapshots to storage outside the machine on a schedule, and test restoring them. A replica is not a backup: an accidental `FLUSHALL` reaches it within milliseconds (more on [undoing a bad write](../../fundamentals/replication/#undoing-a-bad-write)). Redis 8.10 added `BACKUP` commands that take consistent backups on each node of a cluster without all nodes forking at once ([Redis](https://redis.io/docs/latest/operate/oss_and_stack/management/persistence/)).

<!-- demo: kill -9 Redis under writes with RDB only, AOF everysec, and AOF always, and separately hard-reset the VM (a process crash keeps the OS cache, so it does not show the everysec window); count lost acknowledged writes for each; time BGSAVE fork on 1 GB and 10 GB (INFO latest_fork_usec); restart time for both sizes. -->

:::do
For a cache, turn persistence off or keep snapshots for a faster warm-up. For data kept only in Redis, turn on the AOF with `everysec` and keep snapshots for backups; use `always` only where losing the last second is not acceptable and the write rate allows it.
:::

## Keeping a copy on another server

If the Redis server's machine dies, its data is gone until a restore, and the front page reads all hit one server. A copy on a second machine answers both problems.

A replica is a copy of a Redis server that connects to it with `REPLICAOF`; the server it copies is the primary, which Redis also calls a master. The primary forks, sends a snapshot, and then sends every write command to the replica. Replication is asynchronous: the primary replies to the client without waiting for replicas to confirm the write. After a short break, a replica resumes from a backlog of recent writes on the primary; if the backlog has moved past it, the primary sends a full snapshot again, with another fork and a full copy over the network. The backlog is 1 MB by default ([Redis](https://github.com/redis/redis/blob/8.10/redis.conf)), which a busy server fills in a fraction of a second, so raise it. While a replica loads a full snapshot, it blocks its clients, for many seconds on a large dataset ([Redis](https://redis.io/docs/latest/operate/oss_and_stack/management/replication/)).

::diagram{name="redis-resync"}

Replicas can take reads that may be a moment old, such as the front page ranking (more on [reading from a copy that is behind](../../fundamentals/replication/#reading-from-a-copy-that-is-behind)). They reject writes by default.

Two settings narrow the window of lost writes:

- `WAIT N timeout` blocks until N replicas confirm all earlier writes of the same connection, so send it on the connection that wrote. It returns how many replicas confirmed. It makes losing a write unlikely, not impossible: a failover can still pick a replica without it. A count below N means the write is already applied on the primary, and it is unknown whether it will survive ([Redis](https://redis.io/docs/latest/commands/wait/)). `WAITAOF` waits for the write to be flushed to the AOF on the primary, on replicas, or both, and returns both counts.
- `min-replicas-to-write 1` with `min-replicas-max-lag 10` makes the primary refuse writes when no replica has confirmed anything for 10 seconds. A primary cut off from all its replicas then stops taking writes that would be lost, at the price of refusing writes when the replicas are down.

::diagram{name="redis-empty-restart"}

:::avoid
A primary without persistence that restarts automatically. It comes back empty, its replicas copy the empty dataset, and every copy is gone ([Redis](https://redis.io/docs/latest/operate/oss_and_stack/management/replication/)). Turn on persistence on the primary, or turn off its automatic restart.
:::

<!-- demo: primary + replica; read lag under writes; break the link and watch a partial vs full resync with a 1 MB and a 100 MB backlog; WAIT 1 0 latency; the empty-restart wipe with persistence off. -->

## Replacing a failed primary

The primary's machine dies during a big broadcast. A replica has almost all the data, but the app servers still send writes to the dead address.

**Sentinel** runs failover for a primary and its replicas. It is a separate process; run at least three on machines that fail independently, such as in different zones. When a set number of Sentinels, the quorum, cannot reach the primary, they mark it as down. Then a Sentinel needs votes from a majority of all Sentinels, or from the quorum if it is larger, before it promotes a replica, so a Sentinel cut off with a minority never fails over. It picks the replica by priority and by how many of the primary's writes it received, points the other replicas at it, and tells clients the new address: clients ask the Sentinels where the primary is ([Redis](https://redis.io/docs/latest/operate/oss_and_stack/management/sentinel/)). The time to detect a failure is a setting, `down-after-milliseconds`, 30 seconds by default ([Redis](https://github.com/redis/redis/blob/8.10/sentinel.conf)).

::diagram{name="redis-sentinel"}

An unplanned failover can lose writes. Writes that the old primary confirmed but had not yet sent are gone. Worse, if the old primary is cut off with some app servers, it keeps taking their writes until it rejoins as a replica and throws them away. Redis's documentation describes Redis with Sentinel as an eventually consistent system where the last failover wins. In a 2013 test with a network partition, Sentinel lost 1,126 of 1,998 confirmed writes ([Kingsbury](https://aphyr.com/posts/283-jepsen-redis)). `min-replicas-to-write` limits this window to about the lag setting only when the cut-off primary also loses the replicas it counts; with a replica on its side of the cut, it keeps taking writes. Nothing in Redis's replication removes the window (more on [replacing a failed leader](../../fundamentals/replication/#replacing-a-failed-leader)).

::diagram{name="redis-partition-loss"}

So keep data that must not lose a confirmed write in the database, and treat what lives only in Redis as data that can lose its last seconds. Stores that keep the Redis interface but add a replicated log exist as managed services: Amazon MemoryDB confirms a write only after it is stored in a log across several zones ([AWS](https://docs.aws.amazon.com/memorydb/latest/devguide/consistency.html)). A Raft-based module for Redis itself was tested in 2020 ([Jepsen](https://jepsen.io/analyses/redis-raft-1b3fbf6)) and is still marked as not ready for production ([RedisRaft](https://github.com/RedisLabs/redisraft)).

A planned switch, for an upgrade, can avoid the loss when it waits for the replica to catch up. Without Sentinel, the `FAILOVER` command (Redis 6.2) pauses writes on the primary, waits until the replica has all of them, and only then swaps the roles ([Redis](https://redis.io/docs/latest/commands/failover/)), and `CLUSTER FAILOVER` does the same inside a cluster. With Sentinel, make the switch through Sentinel, which has no such wait: `SENTINEL FAILOVER` promotes a replica as if the primary had failed. Pause the app's writes and check that a replica has caught up before you call it. Test unplanned failovers too, with the real client library, since every client must follow the Sentinels and drop connections to the old primary.

<!-- demo: a primary, two replicas, three Sentinels; kill the primary under writes and count lost writes; partition the old primary with one client (iptables) with and without min-replicas-to-write. -->

:::explain
Say that Redis replication is asynchronous, so a failover can lose the last confirmed writes. Keep durable business records in the database, use Redis for copies and for data whose recent loss is acceptable, and name `WAIT` and `min-replicas-to-write` as ways to narrow the window, not to close it.
:::

## Spreading data over many servers

The data grows to 300 GB, and during big events the main thread of the primary stays near 100%. Replicas help only with reads; the writes and the memory need more primaries.

**Redis Cluster** splits the keys into 16,384 hash slots: the slot of a key is the CRC16 of the key modulo 16,384, and each primary owns a range of slots and has its own replicas (more on [splitting by hash of the key](../../fundamentals/sharding/#splitting-by-hash-of-the-key)). There is no proxy. A client keeps a map of slots to servers and sends each command straight to the right primary. A server that gets a key it does not own answers `MOVED` with the right address, and the client updates its map; while a slot moves, `ASK` sends a single request to the new owner. A cluster with N primaries handles about N times the load of one server at the latency of one ([Redis](https://redis.io/docs/latest/operate/oss_and_stack/reference/cluster-spec/)).

::diagram{name="redis-moved-ask"}

Commands on several keys, transactions, and scripts work only when all their keys are in one slot. A **hash tag** puts keys in the same slot: only the part in braces is hashed, so `{channel:42}:info` and `{channel:42}:chat` land together and one script can update both. Use tags only for keys that change together: all keys with one tag sit on one server, and a popular tag becomes a hot spot (more on [a hot key](#one-key-hotter-than-the-rest)). One Redis server can hold several separate key spaces, numbered databases chosen with `SELECT`, but a cluster has only database 0, so an app that separates its data that way must switch to key prefixes. Valkey 9.0 added numbered databases to cluster mode ([Valkey](https://valkey.io/blog/introducing-valkey-9/)). Moving an existing app to a cluster means rewriting every multi-key command whose keys do not share a tag.

::diagram{name="redis-hash-slots"}

The cluster runs its own failover. When a majority of primaries cannot reach a primary for `cluster-node-timeout`, 15 seconds by default ([Redis](https://github.com/redis/redis/blob/8.10/redis.conf)), one of its replicas takes over, usually within a second or two after that. A primary cut off in a minority stops taking writes after the same timeout. Writes are copied asynchronously, as with Sentinel, so a failover can lose confirmed writes ([Redis](https://redis.io/docs/latest/operate/oss_and_stack/reference/cluster-spec/)). If any slot has no live server, the whole cluster stops answering by default; for a cache, `cluster-require-full-coverage no` keeps the other slots available. The smallest useful cluster has three primaries, and the recommended start is three primaries with one replica each ([Redis](https://redis.io/docs/latest/operate/oss_and_stack/management/scaling/)).

Adding a primary does not move anything by itself: an operator or a tool moves slots to it. The classic move copies the keys of a slot one by one, so a request for a key in flight is redirected, multi-key commands on that slot may fail until it ends, and a very large key can stall the move. Redis 8.4 and Valkey 9.0 move a whole slot at once, and the old owner serves the slot until the move completes ([Redis](https://redis.io/docs/latest/develop/whats-new/8-4/), [Valkey](https://valkey.io/blog/introducing-valkey-9/)). The design scales to about 1,000 nodes ([Redis](https://redis.io/docs/latest/operate/oss_and_stack/reference/cluster-spec/)); Valkey reports clusters of 2,000 nodes ([Valkey](https://valkey.io/blog/introducing-valkey-9/)).

Sharding in the client or in a proxy is the alternative: each client hashes the key to one of several independent servers. It works with any server and any client, but resharding and failover become the app's job (more on [finding the shard for a request](../../fundamentals/sharding/#finding-the-shard-for-a-request)).

<!-- demo: a 3+3 cluster; MOVED and ASK seen with redis-cli -c; a cross-slot MSET error and the same with a hash tag; add a fourth primary and reshard under load; kill a primary and time the failover. -->

:::do
Move to Redis Cluster when one primary runs out of memory or of its one core for commands. Design keys so that values used together share a hash tag, keep tags small, and plan the client library's cluster support before the move.
:::

## One key hotter than the rest

During the finals, half of all viewers open one channel. Its info hash and viewer counter sit on one primary, which reaches 100% CPU while the others are almost idle.

Sharding spreads keys, not the load on one key (more on [one key with too much traffic](../../fundamentals/sharding/#one-key-with-too-much-traffic)). First find the key. Redis 8.6 added `HOTKEYS`, which reports the most used keys, and Redis 8.2 added `CLUSTER SLOT-STATS` with the CPU time and network traffic of each slot ([Redis](https://redis.io/docs/latest/develop/whats-new/8-6/), [Redis](https://redis.io/docs/latest/develop/whats-new/8-2/)). `redis-cli --hotkeys` works with an LFU eviction policy, and `redis-cli --bigkeys` finds the largest keys.

For reads, the fixes go from cheap to costly (more on [a key too hot for one cache node](../../fundamentals/caching/#one-key-too-hot-for-one-cache-node)):

- Keep the value in each app server's memory for a second or two. Since Redis 6, **client-side caching** lets the server send an invalidation when a key that a client read changes. In the default mode, the server remembers which client read which key, which costs server memory; in the broadcast mode, it keeps only the key prefixes each client subscribed to and sends an invalidation for every matching change. Use a client library that supports this: it must drop its copies when it loses the connection, and handle an invalidation that arrives before an older reply ([Redis](https://redis.io/docs/latest/develop/reference/client-side-caching/)).
- Read from replicas, or keep several copies of the key under names that hash to different slots.

::diagram{name="redis-client-tracking"}

For writes, add up increments in the app and send them once a second, or split a counter into several keys (more on [one key with too much traffic](../../fundamentals/sharding/#one-key-with-too-much-traffic)). Twitter, which ran its timelines on Redis, was building a client-side cache tier for hot keys for the same reason ([High Scalability](https://highscalability.com/how-twitter-uses-redis-to-scale-105tb-ram-39mm-qps-10000-ins/), 2014).

A big key is the other kind of hot spot: a set of several million members is slow to read, to delete, to copy to a new replica, and to move to another shard, and it cannot be split across servers. Split it into buckets by a hash of the member, and delete big keys with `UNLINK`.

<!-- demo: hammer one key on a 3-node cluster and watch one node's CPU; find it with HOTKEYS and CLUSTER SLOT-STATS; fix with client-side caching (CLIENT TRACKING) and with 8 key copies; compare latency. -->

:::do
Measure which keys are hot before an event that will make them hot. Cache hot reads in the app servers with server-assisted invalidation, spread hot writes over several keys, and keep every key small enough to move.
:::

## Choosing the server and running it

The team now decides what to run in production: Redis or Valkey, and a managed service or its own servers. It also picks how to run Redis, and whether one Redis serves everything.

Redis and Valkey share the same core, and a client that uses the commands of Redis 7.2 works with both. They differ in the rest:

::diagram{name="redis-valkey-fork"}

| | Redis | Valkey |
|---|---|---|
| Owner and license | Redis Ltd.; RSALv2 or SSPLv1 since 7.4, AGPLv3 added in 8.0 | Linux Foundation; BSD |
| Built in | Search, JSON, time series, probabilistic types, vector sets | Core only; JSON, Bloom, and search as modules in a bundle |
| Only here | `INCREX`, idempotent `XADD`, `HOTKEYS`, `BACKUP` | Numbered databases in a cluster, access rules per database, clusters of 2,000 nodes |
| Same feature, other name | `DELEX` | `DELIFEQ` |
| Data files | Redis 7.4 and later cannot be loaded by Valkey | Reads files of Redis up to 7.2 |

When it added Valkey to ElastiCache in 2024, AWS priced it up to 20% lower than its other engines for servers and 33% lower for serverless ([AWS](https://aws.amazon.com/blogs/database/get-started-with-amazon-elasticache-for-valkey)). Pick by license and by the features the design needs, and check each feature added after the fork: some work in both, some have other names, and some exist in only one ([Valkey](https://valkey.io/topics/migration/)). For a pure cache of strings, Memcached is a simpler option: it has no persistence, no replication, and no structures, but it uses all cores in one process. <!-- link: technologies/memcached --> A managed service runs failover, patches, and backups, and keeps the limits of the data model. Check how each one confirms writes and fails over: most keep asynchronous copies, while MemoryDB writes to a durable log across zones before it confirms.

Redis itself offers three ways to run it. A single primary holds all the keys and may have replicas. When it fails, an operator promotes a replica, or, without replicas, restarts it, restores a backup, or rebuilds the data. Sentinel keeps the same shape and adds automatic failover: three or more Sentinels watch the primary and promote a replica (more on [Sentinel](#replacing-a-failed-primary)). A cluster splits the keys over three or more primaries, each with its own replicas, and its nodes fail over by themselves, so it needs no Sentinel (more on [the cluster](#spreading-data-over-many-servers)). One deployment uses one of these ways, but a system can run several: for example, a cluster for the large cache and a primary with Sentinel for sessions and queues. Start with one primary and Sentinel, or a managed service that fails over for you, and move to a cluster when the data or the write load outgrows one server.

::diagram{name="redis-deployments"}

Run separate servers for separate roles. A cache needs `allkeys-lru` and little or no persistence; data kept only in Redis needs `noeviction` and the AOF; queues and pub/sub load the server in their own way. Separate servers keep these settings apart and limit how far one problem spreads: after its incident, Figma split its Redis usage over several clusters ([Figma](https://www.figma.com/blog/postmortem-service-disruptions-on-june-6-and-7-2022/), 2022).

::diagram{name="redis-roles"}

Redis is built for trusted clients in a trusted network ([Redis](https://redis.io/docs/latest/operate/oss_and_stack/management/security/)). Never expose its port to the internet: one `FLUSHALL` from an attacker deletes everything. With no password set, protected mode answers only local clients. Create users with ACL rules that limit commands and key patterns per app, and turn on TLS for clients, replication, and the cluster bus when traffic crosses networks you do not trust. <!-- link: fundamentals/security -->

A few checks keep a server healthy: no swap, transparent huge pages off, `vm.overcommit_memory = 1` so that a fork does not fail on a busy server, memory with headroom for forks, a `maxclients` limit above the real number of connections, and alerts on memory use, evictions, replication lag, failed saves, and the slow log. Test failover and restores on a schedule: measure how long they take and how much data comes back.

<!-- demo: the same app against Redis 8 and Valkey 9 in containers; ACL users for the cache and the queue; TLS-only port. -->

:::do
Choose Redis or Valkey by license and needed features, and avoid commands that exist in only one when you want to keep the choice open. Run one primary with Sentinel, or a managed service, until one server is not enough, then a cluster. Give each role its own server with its own settings, keep Redis in a private network with ACL users, and test failover and restores.
:::

::mark-as-read

## Cheat sheet

- Hot data off the database: Redis keeps all data in RAM and runs commands on one thread; a small command takes far less time than the network round trip. Use it for copies and short-lived data, and keep durable business records in the database.
- A structure for each access: pick string, hash, list, set, sorted set, or stream by how the data is read and changed; let commands change values in the server; keep collections bounded.
- Fitting in memory: estimate from a measured sample; small collections are compact; group tiny values into hashes or bitmaps; leave headroom for forks and buffers.
- One slow command blocks all: no other command runs in the middle of one; avoid `KEYS` and full reads of big keys, use `SCAN` and `UNLINK`; I/O threads do not help a slow command.
- Round trips: multi-key commands, then pipelines, then scripts; reuse long-lived connections.
- Several values as one step: `MULTI`/`EXEC` without rollback; `WATCH` while conflicts are rare; scripts or conditional commands for "check, then write"; scripts block the server and do not roll back.
- Expiry: set the TTL again or keep it with `KEEPTTL` when you replace a value; spread TTLs that end together; expiry events are not timers.
- Memory runs out: always set `maxmemory`; `allkeys-lru` for a cache, `noeviction` for data, on separate servers.
- Counting and ranking: `INCR` for exact counts, heartbeats in a sorted set for "online now", HyperLogLog for distinct counts with about 1% standard error, bounded sorted sets for rankings.
- Pushing events: Pub/Sub delivers at most once and drops slow subscribers; in a cluster, sharded Pub/Sub keeps messages in one shard when its channel model and the client fit.
- Work that survives a worker crash: streams with consumer groups give at-least-once delivery on one server; handlers must be safe to repeat; trim only processed entries; long history or no loss on failover needs a dedicated log.
- One worker at a time: `SET NX PX` with a token and a checked release is fine against duplicate work; for correctness, use database locks, or consensus with fencing checked by the resource.
- Search in memory: Redis Search, geo commands, and vector indexes fit data that is already in Redis and fits in RAM.
- Disk: snapshots lose the writes since the last successful snapshot, AOF `everysec` usually about a second; the AOF is off by default; forks pause the main process, so measure them.
- Copies: replication is asynchronous; `WAIT` and `min-replicas-to-write` narrow the loss window; never auto-restart a primary without persistence.
- Failover: Sentinel needs three or more processes and a majority; an unplanned failover can lose confirmed writes, so durable business records stay in the database.
- Many servers: Redis Cluster uses 16,384 slots and client-side routing; multi-key work needs one slot via hash tags; failover and slot moves are built in.
- A hot key: find it with `HOTKEYS` and slot stats; cache reads in the app with invalidation, spread writes over several keys, keep keys small.
- Choosing and running: Redis and Valkey share the core and differ in license and newer features; one primary with Sentinel or a managed service until one server is not enough, then a cluster; one server per role; private network, ACL users, tested failover and restores.

## Sources

- Josiah L. Carlson. [Redis in Action](https://www.manning.com/books/redis-in-action). Manning, 2013. Chapters 2–6 and 9–11.
- Luigi Fugaro, Mirko Ortensi. [Redis Stack for Application Modernization](https://www.packtpub.com/en-us/product/redis-stack-for-application-modernization-9781837638185). Packt, 2023. Chapters 2, 5, 6, 8, 9, 11, and 12.
