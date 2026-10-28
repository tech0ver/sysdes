---
title: Caching
description: Where to keep copies of data and responses, how to keep them fresh, and how a design survives bursts of misses and a lost cache.
---

Most designs put caches on the read path: browsers, CDNs, and app caches keep copies of results, so the source does less repeated work. To defend a cache, say what you cache and where, how stale a copy may get and how a change reaches it, and how the system behaves when the cache misses, overloads, or fails.

## When a cache pays off

A news site shows articles to readers. Building one article page runs five queries: one each for the article, the author, and related articles, and two for the comment and view counters. Together they take about 80 ms. At 3,000 page views per second the database is at its limit, yet almost all of these views read the same few hundred fresh articles and get the same answers, apart from counters that may lag a little.

A **cache** keeps a copy of a result that is expensive to get and serves it to the next request that asks. The original stays in the database, so the cache may lose any copy at any time and build it again from the source.

The payoff depends on the **hit ratio** H: the share of requests the cache answers. A request that misses has already asked the cache, and then it goes to the database too. Let T_cache be the lookup time, T_db the database time, and R the requests per second. Leaving out the time to store the result and build the page:

- average time = T_cache + (1 − H) × T_db
- requests that reach the database = (1 − H) × R

With H = 95%, a 1 ms cache, and 80 ms of database work, the average is 1 + 0.05 × 80 = 5 ms, and the database builds 150 pages per second instead of 3,000. At five queries per page, that is 750 queries per second instead of 15,000. Each miss still takes 81 ms, so a cache lowers the average and the load, but not the slowest requests. The cache wins as long as the work its hits save, H × T_db, is larger than the lookup it adds to every request.

::diagram{name="database-load"}

Three things set the hit ratio:

- How many different keys there are. A page per article ID repeats; a page per reader or a search per free-text query rarely does.
- How many values fit in memory.
- How many times a value is read before a change or its expiry makes the copy unusable. A value read ten times between changes saves nine trips to the database; a value that changes after every read saves nothing.

Reads are skewed: a few items get most of them. So a cache that holds a small share of the data can still answer most requests. In models of web traffic, the hit ratio grows roughly with the logarithm of the cache size: each doubling of memory adds about the same few points, so each added gigabyte gains less ([Breslau et al.](https://pages.cs.wisc.edu/~cao/papers/zipf-implications.html)). Measure the curve for your own traffic before you buy more memory.

::diagram{name="skewed-reads"}

To choose what to cache first, multiply the database time of a request by its rate and by the share of requests the cache could answer. Article pages cost 80 ms × 3,000 per second, so 240 seconds of database time every second, and most of them repeat. A search page at 300 ms × 50 per second costs 15, and few searches repeat. Caching the article page saves far more, even though search is slower. Then check that the database is the real bottleneck.

Memory costs money, which gives a second test. The **five-minute rule** compares the price of RAM with the price of disk reads: if data is read again often enough, keeping it in RAM costs less than buying the disk throughput to read it each time. The break-even interval depends on the hardware and prices. A 2019 study found about five minutes for 4 KB pages kept in RAM in front of SATA SSDs, with 2018 prices ([Appuswamy et al.](https://cacm.acm.org/magazines/2019/11/240388-the-five-minute-rule-30-years-later-and-its-impact-on-the-storage-hierarchy)); faster disks make it shorter.

:::do
Cache what many requests read and what changes rarely compared with how often it is read. Do not cache results that are unique to one request, or values that decide something and must be exact at that moment, such as stock at checkout.
:::

:::distinguish
A cache holds copies: when it loses them, the system gets slower but stays correct. If some data exists only in the cache, even for a moment, the cache has become a store and needs the durability of a store.
:::

## Putting a cache in front of the database

The site adds a **remote cache**: an in-memory key-value store on its own servers that all app servers use, so they share one copy of each value and can delete it in one place. The key is the article ID, and the value is everything the page needs from the database. A key must include every input that changes the value, such as the language of the page, and the version of the value's format.

With **cache-aside**, the app does the work. It asks the cache first. On a miss, it reads the database, stores the result in the cache, and returns it. Only values that someone reads get into the cache. The cache knows nothing about the database, so the app can cache any result, such as a page built from five queries. When the cache is down, the app can read the database directly, as long as it limits how much load it sends there. The price is code: every place that reads must handle the miss.

With **read-through**, the app asks only the cache, and the cache loads a missing value itself, through a loader the app gives it or because it knows the database. The miss logic lives in one place, and the app code stays simple. But the cache must know how to read the source, and the app needs a planned way to the data for when the cache layer is down.

::diagram{name="aside-vs-through"}

Either way, the copy can fall behind the database. The simplest bound is a **TTL**: the cache drops a value a set time after storing it, and the next read loads a new one. A long TTL gives more hits and older data, a short one the reverse. Choose it from how old the data may be for the reader, not from a default: a list of popular articles may be a minute old, while the body of an old article may stay for hours. The TTL limits how long the cache reuses one copy; the copy is that fresh only if it was loaded from a current source when it was stored.

::diagram{name="ttl-window"}

:::do
Start with cache-aside and a TTL on every value. Pick read-through when a library or product loads values for you and you want the miss logic in one place.
:::

An editor fixes a wrong headline, and readers keep seeing the old one until its TTL ends.

## Updating the cache when data changes

The fix is to act on every write. With **invalidation**, the app commits the change to the database and then deletes the key from the cache. The next read misses and loads the new value.

Delete the key rather than writing the new value into it. Two writers may commit in the order A, B but update the cache in the order B, A, and then the cache keeps A's older value. A delete carries no value that could be old, and deleting twice changes nothing. Delete only after the commit: a delete before it lets a reader load the old row in between and put it back.

::diagram{name="set-vs-delete"}

Two other write paths exist:

- With **write-through**, every write updates the database and the cache before the request returns; in the usual variant the database goes first. The next read is likely to find the new value in the cache, which suits values read right after they are written. Every write pays a second step, the cache fills with values nobody may read, and the two writes are not atomic: if the cache update fails after the commit, the old value stays. Concurrent writers can still reach the cache out of order, so keep a TTL.
- With **write-around**, writes go only to the database, and the cache fills on the next miss. Without a delete, readers see the old value until its TTL ends, so with cache-aside, delete the key after the commit.

A change rarely touches one key. A headline appears on the article page, the home page, the category page, and the author's page, and each of them may be cached whole. Deleting every page that shows the article means knowing all of them. There are several ways out:

- Cache pieces, not pages. Lists hold article IDs, and each article is its own value, read in one batch request. A headline edit then deletes one key, at the price of more cache reads per page. A change to what a list contains, such as a new article in a category, still needs that list deleted or a short TTL on it.
- Keep lists on a short TTL, a minute or less, and accept that they lag behind the article page.
- Put a version in the key, such as `article:42:v7`. A write creates a new version, readers use its key, and the old entry stays until it expires. Readers must learn the current version from a current source, such as the article row, which costs an extra read.
- Read the few values that decide something from the database. When an editor closes the comments on an article, a new comment is checked against the database, while the page with the comments still comes from the cache.

::diagram{name="pages-vs-pieces"}

The editor who just saved an article expects to see the change at once, while other readers can wait a moment. Let the editor's own reads skip the cache and go to a current source (more on [seeing your own writes](../replication/#seeing-your-own-writes)).

:::distinguish
Invalidation removes a copy because the data changed. A TTL removes a copy because enough time passed, whether the data changed or not.
:::

Even with a delete after every commit, the cache can end up with an old value.

## A race that brings back an old value

An editor fixes a headline at the moment a reader misses on the same article:

1. The reader misses and reads version 1 of the row.
2. The editor commits version 2 and deletes the key, which is not in the cache yet.
3. The reader puts version 1 into the cache.

::diagram{name="stale-fill-race"}

Now the cache holds the old headline until the TTL ends, which may be hours. Each race is brief, but with many requests it happens. Meta [describes](https://engineering.fb.com/2022/06/08/core-infra/cache-made-consistent/) the same kind of race in its caches, and notes that to a user a stale entry can look like lost data. In 2022 it reported that the share of TAO cache writes consistent within five minutes had grown over the years from 99.9999% to 99.99999999%.

Each fix does a different job:

- A TTL on every value limits how long the old value lives. It does not stop the race.
- A fill that the cache can reject stops the race. On a miss, the cache gives the reader a fill token, and the reader must show it to store the value. A delete cancels the tokens for that key, so the late store of version 1 fails. Facebook [added such tokens, called leases, to memcached](https://www.usenix.org/system/files/conference/nsdi13/nsdi13-final170_update.pdf) (2013). A version check can do the same job only if the cache remembers the newer version: the write leaves a marker with version 2 instead of a plain delete, and the cache compares and stores in one atomic step. If the marker is evicted before the old fill arrives, the old value wins again.

::diagram{name="fill-token"}

::diagram{name="version-marker"}

- Deletes from the database's change log make sure every write gets its delete. If the app commits and then crashes before its delete, the old value stays until its TTL. A process that reads committed changes through CDC deletes the matching keys. It covers app crashes and writes from other services, scripts, and manual fixes, and it can send a lost delete again. It adds a delay and does not stop the race: keep the app's own delete and the checked fills. <!-- link: patterns/async-processing -->

::diagram{name="change-log-deletes"}

With a cache in each region, a delete can arrive before the database copy that the region's cache fills from has applied the write. The next miss then loads the old row from that copy and caches it (more on [reading from a copy that is behind](../replication/#reading-from-a-copy-that-is-behind)). Send each region's deletes only after the copy used for its fills has applied the change, for example by reading the change log of that copy.

::diagram{name="region-delete-order"}

:::do
Delete after the commit and keep a TTL on every value. For keys that are written while they are read heavily, use fills the cache can reject. When many services or scripts write the same data, add deletes from the change log.
:::

## Choosing what to drop when memory is full

The archive holds 2 million articles of about 50 KB each, 100 GB in all, and the cache has 16 GB. A crawler reads the archive article by article. Each read misses, fills the cache with an article that nobody reads again, and pushes out a fresh one that thousands of readers want. The hit ratio falls.

A cache does not need all the data, only the **working set**: the data read within a period, such as the articles of the last few days. Size the cache for the working set. When memory is full, **eviction** picks which value to drop:

::diagram{name="working-set"}

- LRU (least recently used) drops the value read longest ago. It is the usual default, since a value read a moment ago is likely to be read again. A single pass over cold data, like the crawler's, pushes out hot values.
- LFU (least frequently used) drops the value read least often. It keeps steady favorites through a scan, but a value that was popular yesterday stays too long unless its counts decay over time.
- FIFO (first in, first out) drops the value stored first. CLOCK goes around the values in a circle and gives a value read since its last visit another chance to stay. Both cost less bookkeeping per read than LRU. In a 2020 simulation on Twitter's production traces, FIFO and LRU [often missed about as often](https://www.usenix.org/system/files/osdi20-yang.pdf) at reasonable cache sizes; LRU won mostly when the cache was very small.

::diagram{name="eviction-policies"}

A policy can also refuse to admit a value. TinyLFU keeps an approximate count of recent reads per key and admits a new value only if it is read more often than the value it would push out ([Caffeine](https://github.com/ben-manes/caffeine/wiki/Efficiency) uses it). Most one-off reads, like the crawler's, stay out. Simpler still, do not fill the cache from reads you know are one-off: let the crawler and batch jobs read past it.

::diagram{name="scan-admission"}

When two workloads share one cache, one can push out the other's values. A stream of keys that are read once and replaced by new ones pushes out keys that are read steadily for days. When measurements show such interference, give each workload its own cache, sized for it.

Watch the hit ratio and the eviction count together. Many evictions with a low hit ratio mean the cache is smaller than the working set, or the policy keeps the wrong values. Most cache products let you pick the policy (more on [the policies of Redis](../../technologies/redis/#when-memory-runs-out)).

:::distinguish
Invalidation drops a copy because the data changed. Eviction drops a copy to free memory, whether the data changed or not.
:::

## Too many small writes

Every page view also adds one to the article's view counter. Since the page itself may come from a CDN, the page sends a small separate request to count the view. That is 3,000 writes per second to the database, most of them to the rows of a few hot articles, where each write waits for the one before it (more on [contention on one row](../transactions/#contention-on-one-row)).

With **write-behind** (also called write-back), a write goes only to the cache, and the cache or a background job writes it to the database later, in batches. The counter grows in the cache with an atomic add, and every few seconds the sums per article go to the database. Thousands of writes per second become a few hundred per flush.

::diagram{name="write-behind"}

The cache now holds data that exists nowhere else, so it has become a store. If it fails, the updates that have not reached the database are lost. Replicating the cache protects against losing one node, and frequent flushes keep the usual loss small, but only while flushes succeed: when the database or the flush job is down, the backlog and the possible loss grow. A flush must also be safe to retry. Move the pending counts into a batch in one atomic step; new views then go to a fresh counter. Add the batch to the database and record its ID in one transaction. Retry the same batch until it succeeds; an ID already recorded is skipped.

::diagram{name="flush-batch"}

:::tradeoff
Write-behind turns many small writes into a few large ones and takes them off the request path. You pay with the writes that were not flushed when the cache fails, and with a cache that needs the care of a store.
:::

Use it for numbers where losing some updates is acceptable: view counts, the time a user was last seen. Do not use it for anything the user was told is saved, such as a comment, a payment, or the fact that the user liked a post; the count of likes may still be batched. For those, write to the database or to a durable queue first. <!-- link: fundamentals/messaging -->

## Caching responses outside your servers

Most readers are anonymous, and each of their views still reaches the servers, even when the remote cache answers. The higher a cache sits on the path, the more work a hit saves: a hit in the reader's browser saves the request itself, and a hit in a CDN near the reader saves the trip to the servers (more on [users far away](../networking/#users-far-away)). <!-- link: technologies/cdn -->

::diagram{name="cache-layers"}

A **private cache** serves one user, like a browser. A **shared cache** serves many users, like a CDN or a reverse proxy in front of the servers. Both work as read-through caches: they answer from a stored response or pass the request on and keep the answer. The server tells them what to do with the `Cache-Control` response header. A public article page might send:

```http
Cache-Control: public, max-age=60, s-maxage=300
```

- `max-age=60`: the response stays fresh for 60 seconds, and a cache may reuse it without asking the server. The older `Expires` header gives a date instead; when both are present, caches use `max-age`.
- `s-maxage=300`: shared caches use this lifetime instead of `max-age`, so the CDN keeps the page for five minutes while browsers keep it for one. The server can remove a page from the CDN, but not from a browser.
- `public`: shared caches may store the response even when the request carried an `Authorization` header. Use it only for responses that are the same for everyone.
- `private`: only private caches may store the response.
- `no-store`: no cache may store it. Use it for sensitive data.

A cache finds a stored response by its key: the method and the URL, plus any request headers that the response lists in `Vary`. Every input that changes the response must be in the key, or the response must not be shared. If one URL returns different languages based on the `Accept-Language` header, the response needs `Vary: Accept-Language`, or readers get pages in the wrong language. Each extra input also splits the copies: a user ID in the URL, or `Vary: User-Agent`, leaves a separate copy for each user or browser, and the hit ratio drops.

::diagram{name="vary-language"}

Logged-in readers see a personal block on the article page. Do not send the whole page through a shared cache. Split it: the article, the same for everyone, comes through the CDN, and the personal block comes from a separate request marked `private`.

::diagram{name="personal-split"}

:::avoid
Do not let a shared cache store a personal response. A cookie on the request does not make the response private: mark it `private` or `no-store` yourself. One missing header can show one user's page to everyone behind the same CDN.
:::

## Checking whether a copy is still current

The article page must show edits within a minute, so its lifetime is short. After the lifetime ends, a plain request downloads the whole page again, even if nothing changed.

With **revalidation**, a cache asks the server whether its stale copy is still good instead of downloading it again. The response carries a validator: an `ETag` or a `Last-Modified` date. The cache sends it back in `If-None-Match` or `If-Modified-Since`. If nothing changed, the server answers `304 Not Modified` with no body, and the copy is fresh again. The round trip remains, but the body is not sent.

::diagram{name="revalidation"}

An `ETag` identifies the whole response. Use a hash of the response, or a version that changes when any part of it changes: the article page also shows the author and related articles, so the article row's version alone is not enough. When the server can find such a version without building the page, a `304` also saves the work of building it.

`Cache-Control: no-cache` means a cache may store the response but must check it with the server before each use. The server must then compare against a current source, not against its own stale copy. Send `Cache-Control` on every response: without it, caches may pick a lifetime themselves, often a tenth of the time since `Last-Modified`.

:::distinguish
`no-cache` stores the response and checks it with the server before each use. `no-store` does not store it at all.
:::

## Replacing copies you cannot delete

The site ships a new design: new styles and scripts. A browser may reuse yesterday's files until their lifetime ends, so some readers see the new page with old styles. A server cannot remove a response from a browser before its lifetime ends.

So do not give a long lifetime to a URL whose content must change for readers sooner. For static files, put a hash of the content in the file name, such as `app.3f9a1c.js`, and send `Cache-Control: public, max-age=31536000, immutable`. A year is a common long lifetime, and `immutable` tells the browser that the file will not change while it is fresh, so it does not check even when the reader reloads the page. A new version gets a new URL, and new pages point to it. Keep the old files on the server for a while: pages that are already open still ask for them. For pages themselves, keep the lifetime short, or use `no-cache` with an `ETag`.

::diagram{name="hashed-names"}

A shared cache you control can be purged through its API. When one change affects many URLs, such as an article shown on many pages, tag each response with the IDs it shows and purge by tag ([Cloudflare](https://developers.cloudflare.com/cache/how-to/purge-cache/purge-by-tags/), for example, calls these cache tags). Keep a lifetime on the responses as well, in case a purge or a tag is missed. After a purge, the next requests go to the servers.

::diagram{name="purge-by-tag"}

Pages can also allow old copies for a while, which is a different choice from checking every reuse:

- `stale-while-revalidate=30`: for up to 30 seconds after the lifetime ends, a cache may serve the old copy and fetch a new one in the background, so readers do not wait.
- `stale-if-error=600`: for up to 600 seconds after the lifetime ends, a cache may serve the old copy if the server fails.

Both count from the end of the lifetime and need a stored copy; a cache that does not support them, or has no copy, still goes to the server.

::diagram{name="stale-windows"}

:::do
Hash the names of static files and cache them for a year with `immutable`. For pages, pick a short lifetime with `stale-while-revalidate` when a bounded delay is fine, or `no-cache` with an `ETag` when every view must be checked. Purge shared caches by tag on edits.
:::

## One key too hot for one cache node

Breaking news: one article gets 50,000 reads per second. The remote cache spreads keys over its nodes by a hash of the key (more on [splitting by hash of the key](../sharding/#splitting-by-hash-of-the-key)), so every read of this key goes to one node. At 50 KB per read, that is 2.5 GB per second, or 20 Gbit/s, more than a node with a 10 Gbit/s network can send, while the other nodes stay quiet. Adding nodes does not help, since the key still lives on one of them.

::diagram{name="hot-key-node"}

The usual fix is a **local cache**: each app server keeps the hottest values in its own memory for a few seconds. Reads of the key no longer leave the server. With 50 app servers, a TTL of 5 seconds, and one load at a time on each server, the remote cache sees about 10 reads of the key per second once the local caches are warm. The price:

- Each server keeps its own copy, so memory is used once per server.
- After a change, local copies on different servers can differ until their TTLs end. A delete must reach every server, by a message to all of them, or the short TTL is the only bound.
- A local copy can be loaded from a remote copy that is already old, so the ages add up.
- The local cache is empty after every restart and deploy, which brings bursts of reads.

::diagram{name="local-cache"}

When the app servers cannot spare the memory, or changes should be deleted in the cache cluster rather than wait for a TTL on every server, keep the key on several cache nodes instead. Store N copies under names such as `article:42#1` to `article:42#8`, placed on different nodes. Each read picks a copy at random, and a write deletes all N, with checked fills for each copy. Copies are not fresher by themselves: N deletes are not atomic. Facebook [copies a category of keys](https://www.usenix.org/system/files/conference/nsdi13/nsdi13-final170_update.pdf) to several servers within a pool when one server cannot handle their request rate (2013).

::diagram{name="key-copies"}

Find hot keys before they hurt: count reads per key on a sample of requests. A key that is hot for writes needs another fix (more on [one key with too much traffic](../sharding/#one-key-with-too-much-traffic)).

:::do
Put a small local cache with a TTL of seconds in front of the remote cache for the hottest keys. Copy a key to several cache nodes when app servers cannot hold it, or when you want to delete changes in the cache cluster instead of on every server.
:::

## Many misses at once

The breaking-news article changes, and the edit deletes its key in the remote cache and in every local cache. Rebuilding it takes 80 ms, and in those 80 ms, 4,000 requests arrive and miss. Without protection, each of them runs the same five queries: 20,000 queries within 80 ms. The database slows down, the rebuild takes longer, and more requests miss. This is a **cache stampede**, also called a thundering herd. The same happens when the key's TTL ends.

::diagram{name="stampede"}

The first three fixes combine:

1. One load per key on each server. With **request coalescing**, the first miss loads the value and the other requests on the same server wait for its result. The 4,000 loads become one per app server, 50 in all.
2. Usually one load per key in the whole system. The first miss also creates a lock key in the remote cache with an atomic "create if absent" and an expiry. The others wait a few milliseconds and read again, up to a time limit. A slow loader can outlive the lock, so loads can overlap; that only costs work, and fills the cache can reject keep an old result out. <!-- link: patterns/distributed-locks --> Facebook's leases also limit loads: the cache gives one token per key every 10 seconds, and on keys prone to stampedes, peak database queries [fell from 17,000 to 1,300 per second](https://www.usenix.org/system/files/conference/nsdi13/nsdi13-final170_update.pdf) (2013).
3. Old values while one request loads. Give each value a soft expiry and a later hard one. After the soft expiry, the one loader allowed by the steps above refreshes the value, and other reads get the old value meanwhile, so they do not wait. After the hard expiry, the old value is not used, and reads wait for the load. `stale-while-revalidate` is the same idea in HTTP caches.

::diagram{name="soft-hard-expiry"}

An alternative needs no lock: **probabilistic early refresh**. Each read may refresh the value before it expires, with a chance that grows as the expiry nears and as the rebuild time grows. Reads rarely refresh at the same time, so a stampede becomes a few loads, but two loads can still overlap; add coalescing when even that costs too much. The [XFetch](https://cseweb.ucsd.edu/~avattani/papers/cache_stampede.pdf) rule refreshes when

NOW − D × B × ln(U) ≥ EXPIRY

where D is the time the last rebuild took, B tunes how early refreshes start (1 by default, larger for earlier), and U is a random number between 0 and 1. Since ln(U) is negative, the left side is a moment slightly in the future. The cache must store D and the expiry with the value. Early refresh helps only with expiry: after a delete, the value is gone and one of the fixes above is needed.

::diagram{name="early-refresh"}

Many keys can also expire at once: after the cache was filled in one go, or after a bulk import that set the same TTL on thousands of keys. Pick each TTL at random inside the allowed age, such as between 90% and 100% of it, so that the expiries spread out. This spreads expiries across keys; one hot key still needs one loader.

::diagram{name="ttl-jitter"}

:::explain
Name the problem and the fix together: a hot key that expires sends every reader to the database, so allow one load per key and serve the old value while it runs. Some prep materials call this cache breakdown, and call many keys expiring at once a cache avalanche.
:::

## Requests for data that does not exist

A bot asks for `/articles/9999999` and thousands of other IDs that do not exist. The site's cache-aside code stores only rows it found, so every such request misses and reaches the database. Prep materials call this cache penetration.

With **negative caching**, the cache stores "not found" for the key, with a short TTL such as a minute. The price is memory for each missing key, and a new article with that ID stays hidden until the entry expires, unless creating the article deletes it.

Random IDs are endless, and their "not found" entries can fill the cache. Stop them before the cache instead: check the ID's format and range, keep a Bloom filter of the IDs that exist, and limit requests per client. <!-- link: patterns/rate-limiting --> A new ID must reach the filter before readers rely on it, or the filter hides a real article; when the filter may lag, ask the database on a "no" for recent IDs.

::diagram{name="missing-ids"}

The same applies to errors. When the database or another service fails, every miss asks it again and keeps it down. For a key that keeps failing, cache the error for a few seconds or serve the last good value if it is not too old; never share an error that depends on the user, such as a denied access. Errors on many different keys need a cap on all requests to the failing service. <!-- link: patterns/resilience -->

:::do
Cache repeated "not found" results with a short TTL. For a failing source, cache the error briefly or serve the last good value, and cap requests to it. Filter IDs that cannot exist before they reach the cache.
:::

## Losing the cache

With 95% of reads answered by the cache, the team moved the database to a smaller machine sized for the misses: about 150 page builds per second plus headroom. Then a cache node fails, or the whole cache restarts after an upgrade. The database gets all 3,000 page views per second, twenty times its usual load. It slows down, requests time out, readers and clients retry, and the load grows. The cache holds only copies, yet the site depends on it.

::diagram{name="lost-cache-load"}

Ways to lose less and recover faster:

- Lose a slice, not all of it. Spread keys over many nodes so that one failed node empties only its share. Use consistent hashing or logical shards: with hash mod N, adding or removing a node maps almost every key to a new node, which empties the cache just the same (more on [adding nodes without moving every key](../sharding/#adding-nodes-without-moving-every-key)).
- Send a failed node's keys to spare nodes, not to the remaining ones. The failed node's hot keys could overload a remaining node. Facebook [keeps about 1% of its cache servers](https://www.usenix.org/system/files/conference/nsdi13/nsdi13-final170_update.pdf) as spares whose values expire quickly, which cut the failures that users saw by 99% (2013). A follower for each cache node can also take over with its values already in memory, at the cost of twice the memory.

::diagram{name="spares-vs-rehash"}

- Warm the cache before it takes traffic. Fill a new cache from a warm one or from a list of hot keys, slowly enough not to overload the source, and with the same checked fills, since a copied value can race with a delete. Facebook [brought new cache clusters to full capacity](https://www.usenix.org/system/files/conference/nsdi13/nsdi13-final170_update.pdf) in a few hours instead of a few days this way (2013).
- Protect the database. Limit the rate of misses that reach it and reject or serve stale values for the rest, rather than let it fall over. <!-- link: patterns/resilience -->

Deploys cause the same misses. Local caches start empty, so replace a few app servers at a time and most local caches stay warm. During a rolling deploy, old and new code run together, so each must read values the other wrote; otherwise put the format version in the key, and plan for the misses and the extra memory while both sets of keys exist.

Watch the miss rate, the cache's latency and errors, and the load on the database, not only the hit ratio: a high hit ratio can hide misses that are expensive.

:::avoid
Do not size the database only for the hit ratio. Know how many misses per second it survives, cap misses at that rate, and test the system with the cache turned off.
:::

## Picking a caching plan per data

Start from how old each kind of data may be when a reader sees it, and split that age between the layers. An app can build a new response from a value that is already old in the remote cache, and the response then gets its full HTTP lifetime. HTTP caches pass the response's age along, so the CDN and the browser share one lifetime. Add the stale windows to the total.

::diagram{name="age-budget"}

| Data | Where | Allowed age | How changes arrive |
| --- | --- | --- | --- |
| Styles, scripts, images | Browser and CDN | Never changes | Hash in the file name, a year with `immutable` |
| Article page, anonymous | Browser, CDN, remote cache | About a minute in total | `max-age` of seconds, short `s-maxage`, purge by tag; delete after commit in the remote cache |
| Home and category pages | CDN, remote cache | About a minute | Lists of IDs with a short TTL; articles read as pieces |
| Breaking-news article | Local, remote, CDN | About a minute, a few seconds of it local | Local TTL of seconds; one load per key, old value while it loads |
| Personal block | Browser | Checked on each view | `private, no-cache` with an `ETag`, separate request |
| Comments closed | Database | Exact | Read when a comment is posted |
| Comment count | Inside the cached page | Same as the page | Rebuilt with the page |
| View count | Remote cache as the store | Behind by one flush while flushes succeed | Write-behind with batched, retried flushes |
| Login session | A shared in-memory store, not a cache | Exact | Written on login and logout |

The session store owns the sessions: they have no copy in a database, so losing the store logs everyone out. Choose its durability from the cost of losing sessions, even when it runs on the same software as the cache (more on [servers with state](../networking/#servers-with-state)).

:::do
Start with cache-aside, a TTL on every value, and a delete after each commit. Cache shared responses in browsers and a CDN with an explicit `Cache-Control`. Add a local cache, stampede protection, and negative caching when hot keys, expiries, or missing keys show up in the database load.
:::

::mark-as-read

## Cheat sheet

- A cache pays off when many requests read the same values and they change rarely compared with how often they are read. Average time = T_cache + (1 − H) × T_db, and the database gets (1 − H) × R; misses keep their full latency. Rank candidates by database time × rate × expected hit ratio.
- Cache-aside: the app loads misses and can bypass a failed cache if it caps the load on the database. Read-through: the cache loads misses itself. Put every input that changes a value into its key, and a TTL chosen from the allowed age on every value.
- On a write, commit, then delete the key. Write-through updates the cache synchronously, so values read right after a write are likely hits. For data on many pages, cache pieces, use short TTLs for lists, or versions in keys; read the values that decide something from the database.
- A reader that misses can store an old value after a writer's delete. A TTL limits it; fill tokens, or version checks with a kept marker, stop it; deletes from the change log make sure no write misses its delete.
- Size the cache for the working set. LRU is the default; LFU and admission policies such as TinyLFU resist scans; FIFO and CLOCK cost less, and FIFO often matched LRU in trace simulations at reasonable cache sizes. Keep one-off reads out of the cache.
- Write-behind batches writes in the cache and flushes them later. Use it only where losing some updates is acceptable, and make each flush an atomic batch with an ID that the database records once.
- Browsers are private caches; CDNs and reverse proxies are shared. `Cache-Control` sets `max-age`, `s-maxage`, `public`, `private`, and `no-store`; the key is the method and URL plus `Vary` headers. Serve personal parts by a separate `private` request.
- Revalidation sends the `ETag` or `Last-Modified` back; an unchanged response gets `304 Not Modified` without a body. The `ETag` must change when any part of the response changes. `no-cache` stores and checks each reuse; `no-store` does not store.
- A browser copy cannot be deleted early: hash static file names and cache them for a year with `immutable`; give pages a short lifetime or `no-cache`. Purge shared caches by tag where supported. `stale-while-revalidate` and `stale-if-error` allow old copies for a set time after the lifetime ends.
- A hot key overloads one cache node: put a local cache with a TTL of seconds in front, or copy the key to several nodes and delete all copies on a write. Find hot keys by counting reads on a sample.
- A stampede is many misses on one key at once. Coalesce requests on each server, let one request load per key with a takeover after a timeout, and serve the old value until a hard expiry. Probabilistic early refresh reduces expiry bursts without a lock but can duplicate loads. Pick TTLs at random inside the allowed age.
- Cache repeated "not found" results briefly; for a failing source, cache the error briefly or serve the last good value, and never share user-specific errors. Filter impossible IDs with format checks, a Bloom filter that gets new IDs first, and rate limits.
- Losing the cache sends all reads to the database. Spread keys with consistent hashing or logical shards, move a failed node's keys to spares, warm a new cache, cap misses that reach the database, and test with the cache off.
- Pick a plan per data: how old it may be in total across layers, where the copies live, and how a change reaches them. Data that exists only in memory, such as sessions or unflushed counters, is a store, not a cache.

## Sources

- Martin L. Abbott, Michael T. Fisher. [The Art of Scalability](https://www.informit.com/store/art-of-scalability-scalable-web-architecture-processes-9780137030422). Addison-Wesley, 2009. Chapter 25.
- Artur Ejsmont. [Web Scalability for Startup Engineers](https://www.mheducation.com/highered/mhp/product/web-scalability-startup-engineers.html). McGraw-Hill Education, 2015. Chapter 6.
- Pekka Enberg. [Latency](https://www.manning.com/books/latency). Manning, 2025. Chapter 6.
- Rylan Liu. [System Design Interview Fundamentals](https://payhip.com/b/2oudb). Independently published, 2021. "Cache Strategies".
- Alex Petrov. [Database Internals](https://www.oreilly.com/library/view/database-internals/9781492040330/). O'Reilly, 2019. Chapter 5.
- Zhiyong Tan. [Acing the System Design Interview](https://www.manning.com/books/acing-the-system-design-interview). Manning, 2024. Chapter 4.
- Roberto Vitillo. [Understanding Distributed Systems](https://understandingdistributed.systems/), 2nd edition. 2022. Chapters 14, 15, and 20.
- Jas Chhabra. [Caching challenges and strategies](https://aws.amazon.com/builders-library/caching-challenges-and-strategies/). Amazon Builders' Library.
- MDN. [HTTP caching](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Caching).
- Mark Nottingham. [HTTP Cache-Control Extensions for Stale Content](https://www.rfc-editor.org/rfc/rfc5861). RFC 5861, 2010.
