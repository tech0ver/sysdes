# ARTICLES.md

The map of articles on this site: written and planned. Use it to decide which article a topic belongs to and to link articles to each other.

An article covers its own topic in depth. When another article needs that topic, it says one line about it and links here instead of explaining it again.

## Links to articles that do not exist yet

Put a hidden marker where the link should go. The marker is an HTML comment, so the site does not show it:

```md
Real-time systems route messages between servers for this. <!-- link: patterns/real-time -->
```

The value is the page path under `src/content/docs/`, without the extension. Use the paths from this file.

When you write an article, find the markers that point to it and turn them into relative links:

```sh
grep -rn "link: patterns/real-time" src/content/docs
```

Then add links from the new article to the existing ones, and update `readMore` in the glossary for the terms the new article explains.

## Sections

- **Fundamentals** — the computer science under system design: concepts and trade-offs that every design uses, with no specific products. A fundamental idea makes sense without the product around it: a lost update is the same for tickets, bank accounts, and stock. Once a fundamental article exists, the topic grows only through patterns and technologies.
- **Patterns** — reusable solutions built from the fundamentals: how to solve a typical problem in a design. A pattern combines several primitives for one kind of product problem and has its own steps, numbers, background jobs, and edge cases; it often matches an interview task ("design a ticket booking"). A fundamentals article names a pattern and says when to pick it; the pattern's article says how to build it (see WRITING.md, "Other articles").
- **Technologies** — specific tools and products, and how they implement the fundamentals.

## Fundamentals

Listed in the planned reading order. Each article tells the story of one system as it grows, where each solution brings the next problem. An article does not end with a bridge to the next one. Articles that exist on the site are marked **(written)**.

- `fundamentals/networking` **(written)** — How components talk over a network: client and server, IP and DNS, TCP and UDP, TLS, HTTP, pushing updates, load balancing, stateless servers, regions and CDN, failed calls.
- `fundamentals/storage-engines` **(written)** — How one node stores and finds data, built up from a plain file: append-only log, hash index, segments and compaction, crash recovery and when a write is durable, keeping all data in memory versus on disk, SSTable and LSM-tree, Bloom filters, B-tree, write-ahead log, B-tree versus LSM-tree, secondary, composite, and covering indexes and their cost, row and column storage, OLTP and OLAP. No concurrent access here.
- `fundamentals/databases` **(written)** — What shape to give data and where to keep it: relational, document, key-value, wide-column, graph, time-series, and analytics models; normalization and copies for fast reads; embedding versus referencing; schema flexibility; designing from the queries; partition and sort keys; object storage for files; full-text and vector search; which store owns each fact and which copies are derived from it; choosing and combining stores. Builds on storage-engines: each model sits on an engine described there, and links to its blocks instead of repeating them.
- `fundamentals/transactions` **(written)** — Keeping data correct under concurrent access and crashes on one node: atomicity and recovery, lost updates and atomic operations, isolation levels and their anomalies, snapshot isolation and MVCC, optimistic and pessimistic locking, deadlocks, write skew and phantoms, serializable, holds that outlive a transaction, hot rows, retries, ACID and BASE.
- `fundamentals/replication` **(written)** — Copies of data across nodes and regions: leader and followers, synchronous and asynchronous replication, replication log formats, new followers, backups, replication lag, stale reads, eventual consistency, read-your-writes, monotonic reads, consistent prefix, failover, multi-leader and regions, write conflicts, leaderless and quorums, repairing copies.
- `fundamentals/sharding` **(written)** — Splitting data across nodes: what to try before sharding, shard keys, range and hash partitioning, logical shards, consistent hashing, routing, rebalancing, uneven tenants, silo and pool storage per tenant, hot keys, scatter-gather, secondary indexes across shards, writes across shards.
- `fundamentals/consistency` — How nodes agree: consistency models from linearizable (strong) to causal and eventual, CAP and PACELC, time and ordering of events, consensus (Raft), leader election, distributed transactions (2PC, saga).
- `fundamentals/caching` — Where to cache, cache-aside and write-through, HTTP caching (Cache-Control, ETag), invalidation, eviction, hot keys, cache stampede.
- `fundamentals/async-communication` — Decoupling components in time: queues and logs, pub/sub, delivery guarantees (at-most-once, at-least-once, exactly-once), idempotent consumers, ordering, back-pressure.
- `fundamentals/data-processing` — Moving and reshaping data after it is written: batch and stream processing, ETL and ELT, data warehouses and lakes, how fresh derived data is. Delivery guarantees stay in async-communication.
- `fundamentals/failures` — Keeping the whole system up: partial failures, failure detection, redundancy and failover, availability math, blast radius, graceful degradation. A single failed call (timeouts, retries, idempotency keys) is in networking.
- `fundamentals/security` — Authentication and authorization, CORS, cookies, mTLS, where to end TLS, secrets.
- `fundamentals/observability` — Metrics, logs, traces, SLOs and alerts.
- `fundamentals/requirements` — Framing a design: functional and non-functional requirements, latency and throughput, percentiles, availability in nines, SLOs, back-of-the-envelope estimates, the numbers to remember (memory, disk, network round trips). Written last, when the other articles exist to link to.

### Three meanings of "consistency"

The word means different things in different articles. Each article says which one it uses and links to the others.

- The C in ACID: data follows its rules, for example a balance never goes below zero. In `fundamentals/transactions`.
- Isolation: concurrent transactions do not see each other's half-done work. In `fundamentals/transactions`.
- Consistency between copies: strong or eventual. `fundamentals/replication` shows how replication lag causes eventual consistency; `fundamentals/consistency` covers the full range of models and how to get strong consistency.

## Patterns

- `patterns/scaling` — Making a system take ten times the load: the AKF scale cube (copies, split by function, split by key), finding the bottleneck first (reads, writes, data size, app compute), then steps in order of cost for reads (query and index fixes, denormalized copies, followers, cache, CDN) and for writes (a bigger machine, batching and queues, a write-optimized engine, split by function, sharding, hot keys). Each step gives its signal and price and links to the article that explains it.
- `patterns/resilience` — Circuit breaker, bulkhead, retry budget, load shedding, cascading failures.
- `patterns/rate-limiting` — Limiting algorithms, limits across many servers, the "design a rate limiter" task.
- `patterns/reservations` — Holding limited stock while a user decides: holds with expiry, leases, locks with a time limit, releasing expired holds, overselling and overbooking, the "design a ticket or hotel booking" task.
- `patterns/real-time` — Long-lived connections at scale: routing messages between servers, reconnect and replay, heartbeats, slow clients, presence.
- `patterns/api-gateway` — One entry point for clients: API gateway, BFF, auth, routing, response composition.
- `patterns/service-discovery` — Service registry, client-side load balancing, service mesh.
- `patterns/proximity-search` — Finding things near a point: why a regular index fails in two dimensions, geohash, quadtree, R-tree.
- `patterns/data-migration` — Moving live data without downtime: copying a snapshot and streaming changes, double writes, backfills, comparing reads, cutover and rollback; used for moving tenants between shards, resharding, schema changes, and switching stores.
- `patterns/unique-ids` — Generating unique IDs across many nodes: database sequences and ranges per node, UUIDs, time-ordered IDs (Snowflake-style, ULID, UUIDv7), IDs that carry the shard.
- `patterns/async-messaging` — Queues in a design: 202 Accepted and background work, transactional outbox, change data capture (CDC), fan-out.
- `patterns/news-feed` — Building a home feed: fan-out on write, on read, and the hybrid for accounts with many followers.
- `patterns/cqrs` — Separate models for writes and reads (CQRS), and event sourcing as a separate choice.
- `patterns/vector-search` — Similarity search over embeddings: exact and approximate indexes, filters, recall.
- `patterns/offline-sync` — Apps that work without a network: a local copy on each device, syncing changes later, merging concurrent edits (CRDTs, operational transformation), real-time collaboration.

## Technologies

- `technologies/api-styles` — REST, gRPC, GraphQL; HTTP methods, status codes, idempotent methods.
- `technologies/load-balancers` — Forward and reverse proxies, balancing algorithms in depth, sticky sessions, hash routing, connection draining; NGINX, Envoy, HAProxy.
- `technologies/cdn` — How a CDN works, anycast routing to a nearby edge, what to cache on it, invalidation.
- `technologies/webrtc` — How WebRTC connects peers: NAT, STUN, TURN, signaling.
- `technologies/postgresql` — PostgreSQL: B-tree storage, index types, when to pick it.
- `technologies/mysql` — MySQL with InnoDB: clustered primary key, when to pick it.
- `technologies/mongodb` — MongoDB: documents, embedding and references, schema validation, when to pick it.
- `technologies/dynamodb` — DynamoDB: partition and sort keys, single-table design, secondary indexes.
- `technologies/cassandra` — Cassandra: LSM-tree storage, partition and clustering keys, write-heavy workloads.
- `technologies/rocksdb` — RocksDB: an embedded LSM-tree engine used inside other databases.
- `technologies/redis` — Redis: an in-memory store, its data structures, persistence settings, use as a cache or as the main store.
- `technologies/memcached` — Memcached: a cache-only in-memory store.
- `technologies/elasticsearch` — Elasticsearch: full-text search with an inverted index.
- `technologies/neo4j` — Neo4j: a graph database, Cypher, when a graph store pays off.
- `technologies/object-storage` — Object storage (Amazon S3 and similar): keys and buckets, pre-signed URLs, multipart upload, durability and availability.
- `technologies/clickhouse` — ClickHouse: a column store for analytics.
- `technologies/time-series-databases` — Time-series databases (Prometheus, InfluxDB, TimescaleDB): ingestion, retention, rollups, cardinality.
