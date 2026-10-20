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

Framework serves the interview focus, Practices serves the engineering focus, and the other sections serve both (see AGENTS.md, "Project").

- **Fundamentals** — the computer science under system design, from how one machine runs a service to how many nodes agree: concepts and trade-offs that every design uses, with no specific products. A fundamental idea makes sense without the product around it: a lost update is the same for tickets, bank accounts, and stock. Once a fundamental article exists, the topic grows only through patterns and technologies.
- **Patterns** — reusable solutions built from the fundamentals: how to solve a typical problem in a design. A pattern page groups related patterns around one kind of product problem, one pattern per block. Each block gives the problem the pattern solves, the primitives it uses, its steps, numbers, background jobs, and edge cases, and when to pick it over the other patterns on the page. A page often matches an interview task ("design a ticket booking"). A fundamentals article names a pattern and says when to pick it; the pattern's article says how to build it (see WRITING.md, "Other articles").
- **Technologies** — specific tools and products, and how they implement the fundamentals. Prefer tools that run anywhere, mostly open source. A service tied to one cloud vendor gets an article only after a separate decision, because it ties a design to that vendor; `technologies/dynamodb` waits for that decision.
- **Framework** — one page at the top level of the sidebar, like the glossary: how to work through a design interview: the purpose of each step, questions to ask, expected outputs, and time to spend.
- **Practices** — the theory of how engineers build, change, and run systems: kinds of tests and what each one catches, load testing, ways to release and roll back, code review, refactoring, operations and incidents. A practice article is built like a fundamentals article: the methods, what each one protects against and costs, and when to pick it. Specific tools go to Technologies. A practice is about the work around any system; Systems design one product.
- **Systems** — complete system designs that apply the framework, fundamentals, patterns, and technologies, with alternative designs and the requirements that favor each one.

## Writing order

Write the planned articles in arcs. An arc starts with a fundamentals article, when it has one, and goes on with the patterns and technologies that grow from it, so each new article mostly links back to written ones. Within an arc, follow the listed order.

1. One service on one database grows: `technologies/postgresql`, `technologies/redis`, `patterns/reservations`, `patterns/unique-ids`, `technologies/etcd`, `patterns/distributed-locks`, `patterns/proximity-search`, `patterns/counting`, `technologies/elasticsearch`, `patterns/search`, `patterns/vector-search`, `patterns/scaling` (last, as the summary of the data fundamentals).
2. Decoupling in time: `fundamentals/encoding`, `fundamentals/messaging`, `patterns/async-processing`, `technologies/kafka`, `technologies/rabbitmq`, `patterns/job-scheduling`, `patterns/real-time`, `technologies/webrtc`, `fundamentals/data-processing`, `technologies/flink`, `technologies/spark`, `patterns/cqrs`, `patterns/news-feed`, `technologies/clickhouse`, `technologies/object-storage`, `patterns/large-files`.
3. Many services: `technologies/api-styles`, `patterns/api-gateway`, `patterns/service-discovery`, `technologies/load-balancers`, `patterns/sagas`, `technologies/temporal`, `patterns/ledger`, `technologies/distributed-sql`, `patterns/data-migration`.
4. Staying up: `fundamentals/failures`, `patterns/resilience`, `patterns/rate-limiting`, `technologies/cdn`.
5. Trust: `fundamentals/security`.
6. Seeing and changing a running system: `fundamentals/observability`, `technologies/opentelemetry`, `technologies/time-series-databases`, `practices/operations`, `practices/testing`, `practices/load-testing`, `practices/releases`, `technologies/kubernetes`, `practices/code-review`, `practices/design-docs`, `practices/refactoring`.
7. Putting it together: `fundamentals/requirements`, `framework`, `systems/url-shortener`, `systems/ride-hailing`.

At any time, between arcs or when an article needs them: `technologies/cassandra`, `technologies/mysql`, `technologies/mongodb`, `technologies/rocksdb`, `technologies/memcached`, `technologies/neo4j`, `patterns/offline-sync`. Cassandra has the most link markers waiting. `technologies/dynamodb` waits for the decision on vendor services (see "Sections").

Where the order cannot be linear, put a link marker and fill it later: `patterns/scaling` needs numbers from `fundamentals/requirements`, and `patterns/scaling` and `practices/load-testing` link to each other.

When an article is written, mark it **(written)** in its section below. The arcs list only the order.

## Fundamentals

Listed in the planned reading order. Each article tells the story of one system as it grows, where each solution brings the next problem. An article does not end with a bridge to the next one. Articles that exist on the site are marked **(written)**.

- `fundamentals/networking` **(written)** — How components talk over a network: client and server, IP and DNS, TCP and UDP, TLS, HTTP, pushing updates, load balancing, stateless servers, regions and CDN, failed calls.
- `fundamentals/storage-engines` **(written)** — How one node stores and finds data, built up from a plain file: append-only log, hash index, segments and compaction, crash recovery and when a write is durable, keeping all data in memory versus on disk, SSTable and LSM-tree, Bloom filters, B-tree, write-ahead log, B-tree versus LSM-tree, secondary, composite, and covering indexes and their cost, row and column storage, OLTP and OLAP. No concurrent access here.
- `fundamentals/databases` **(written)** — What shape to give data and where to keep it: relational, document, key-value, wide-column, graph, time-series, and analytics models; normalization and copies for fast reads; embedding versus referencing; schema flexibility; designing from the queries; partition and sort keys; object storage for files; full-text and vector search; which store owns each fact and which copies are derived from it; choosing and combining stores. Builds on storage-engines: each model sits on an engine described there, and links to its blocks instead of repeating them.
- `fundamentals/transactions` **(written)** — Keeping data correct under concurrent access and crashes on one node: atomicity and recovery, lost updates and atomic operations, isolation levels and their anomalies, snapshot isolation and MVCC, optimistic and pessimistic locking, deadlocks, write skew and phantoms, serializable, holds that outlive a transaction, hot rows, retries, ACID and BASE.
- `fundamentals/replication` **(written)** — Copies of data across nodes and regions: leader and followers, synchronous and asynchronous replication, replication log formats, new followers, backups, replication lag, stale reads, eventual consistency, read-your-writes, monotonic reads, consistent prefix, failover, multi-leader and regions, write conflicts, leaderless and quorums, repairing copies.
- `fundamentals/sharding` **(written)** — Splitting data across nodes: what to try before sharding, shard keys, range and hash partitioning, logical shards, consistent hashing, routing, rebalancing, uneven tenants, silo and pool storage per tenant, hot keys, scatter-gather, secondary indexes across shards, writes across shards.
- `fundamentals/consistency` **(written)** — How nodes agree: linearizability and where it is needed, CAP, PACELC and weaker guarantees, causal consistency, physical clocks, Lamport and vector clocks, consensus, Raft elections and log, coordination services, leases and fencing tokens, two-phase commit, timestamps across nodes (timestamp oracle, TrueTime, hybrid logical clocks), sagas, and picking a guarantee per operation.
- `fundamentals/caching` **(written)** — Keeping copies of data and responses: when a cache pays off (hit ratio, the five-minute rule), cache-aside and read-through, TTL, invalidation and write-through, the race that re-caches old data, eviction and the working set, write-behind, HTTP caching (Cache-Control, Vary, ETag, purge, stale-while-revalidate), local caches for hot keys, cache stampedes, negative caching, losing the cache, and a caching plan per data.
- `fundamentals/encoding` — Turning data into bytes and changing its shape over time: text and binary formats (JSON, Protocol Buffers, Avro), schemas, backward and forward compatibility, old and new code running side by side during a release, old records read by new code, versioning of APIs and events. Messaging, API styles, and storage link here instead of explaining compatibility again.
- `fundamentals/messaging` — Decoupling components in time: queues and logs, pub/sub, partitions and ordering, consumer groups and offsets, replay, delivery guarantees (at-most-once, at-least-once, exactly-once), idempotent consumers, events as contracts between teams, poison messages, retry topics and dead-letter queues, back-pressure, a log copied to another region.
- `fundamentals/data-processing` — Moving and reshaping data after it is written: batch and stream processing, ETL and ELT, data warehouses and lakes, how fresh derived data is; event time and processing time, windows, watermarks and late events; joining a stream with a table; views kept up to date from a stream; lambda and kappa architectures. Delivery guarantees stay in `fundamentals/messaging`.
- `fundamentals/failures` — Keeping the whole system up: partial failures, failure detection, a process killed for running out of memory, redundancy and failover, zones and regions as failure domains and the capacity left after losing one, availability math, blast radius and how gradual releases limit it, graceful degradation, backups and disaster recovery (RPO, RTO, and recovery setups from backup-and-restore to active-active). A single failed call (timeouts, retries, idempotency keys) is in networking.
- `fundamentals/security` — Threat modeling and trust boundaries; user identity (sessions, tokens, OAuth 2.0 and OpenID Connect) and service identity (mTLS, workload identity); authorization; CORS and cookies; where to end TLS; secrets; encryption in transit and at rest, and managing keys; sensitive personal data: collecting less, tokenizing, retention, deleting it from every copy; signing requests to outside systems.
- `fundamentals/observability` — Metrics, logs, traces, SLOs and alerts. What people do with these signals (on-call, incidents) is in `practices/operations`.
- `fundamentals/requirements` — Framing a design and its numbers: functional and non-functional requirements, latency and throughput, percentiles, availability in nines, SLOs, back-of-the-envelope estimates (users, requests per second, peaks, data size); the numbers to remember: speeds of CPU, memory, disk, and network; why latency grows before a server is fully busy (queueing, Little's law) and how much headroom to keep; what one server can handle and which resource runs out first, the limit behind every "stay on one node first" advice; cost as a requirement (traffic between zones and out of the cloud, storage, idle capacity). Written last, when the other articles exist to link to.

### How one machine works

There is no article on how one machine runs a service (CPU, memory, processes, threads, operating system limits). Each idea goes to the article where a problem needs it:

- Speeds of the hardware, queueing, and the capacity of one server: `fundamentals/requirements`.
- Page cache and fsync: `fundamentals/storage-engines` (written). Process pauses: `fundamentals/consistency` (written).
- Processes, threads, and an event loop; CPU-bound and IO-bound work: `patterns/scaling`.
- Memory per connection and the limit on open files: `patterns/real-time`.
- A process per database connection and connection pools: `technologies/postgresql`.
- Running out of ports and the connection backlog on a proxy: `technologies/load-balancers`.
- A process killed for running out of memory: `fundamentals/failures`.
- Load testing and finding the bottleneck: `practices/load-testing`.

If three or more articles need to explain the same operating system idea, give it a fundamentals article and replace those explanations with links.

### Three meanings of "consistency"

The word means different things in different articles. Each article says which one it uses and links to the others.

- The C in ACID: data follows its rules, for example a balance never goes below zero. In `fundamentals/transactions`.
- Isolation: concurrent transactions do not see each other's half-done work. In `fundamentals/transactions`.
- Consistency between copies: strong or eventual. `fundamentals/replication` shows how replication lag causes eventual consistency; `fundamentals/consistency` covers the full range of models and how to get strong consistency.

## Patterns

- `patterns/scaling` — Making a system take ten times the load: the AKF scale cube (copies, split by function, split by key), finding the bottleneck first (reads, writes, data size, app compute; measured with a load test from `practices/load-testing`), using the whole machine first (processes, threads, an event loop; CPU-bound and IO-bound work), splitting by function into services (service boundaries, who owns which data, from a modular monolith to services), then steps in order of cost for reads (query and index fixes, denormalized copies, followers, cache, CDN) and for writes (a bigger machine, batching and queues, a write-optimized engine, split by function, sharding, hot keys). Each step gives its signal and price and links to the article that explains it.
- `patterns/resilience` — Circuit breaker, bulkhead, retry budget, deadlines passed along a chain of calls, load shedding, cascading failures.
- `patterns/rate-limiting` — Limiting algorithms, limits across many servers, the "design a rate limiter" task.
- `patterns/distributed-locks` — Letting only one worker act across many servers: locks for efficiency and for correctness, a key with an expiry in Redis and why Redlock is debated, locks and leader election on etcd or ZooKeeper, leases and their renewal, fencing tokens at the receiver, work that is safe to repeat.
- `patterns/reservations` — Holding limited stock while a user decides, including a person such as a driver offered a ride: holds with expiry, leases, locks with a time limit, releasing expired holds, overselling and overbooking, the "design a ticket or hotel booking" task.
- `patterns/real-time` — Long-lived connections at scale: memory per connection, the limit on open files, an event loop, routing messages between servers, reconnect and replay, heartbeats, slow clients, presence.
- `patterns/api-gateway` — One entry point for clients: API gateway, BFF, auth, routing, response composition.
- `patterns/service-discovery` — Service registry, internal DNS, client-side load balancing, service mesh.
- `patterns/proximity-search` — Finding things near a point: why a regular index fails in two dimensions, geohash, quadtree, R-tree, H3 and S2 cells, moving objects that report their position every few seconds and an in-memory index for them.
- `patterns/data-migration` — Moving live data without downtime: copying a snapshot and streaming changes, double writes, backfills, comparing reads, cutover and rollback; used for moving tenants between shards, resharding, schema changes in steps (expand and contract), and switching stores.
- `patterns/unique-ids` — Generating unique IDs across many nodes: database sequences and ranges per node, UUIDs, time-ordered IDs (Snowflake-style, ULID, UUIDv7), IDs that carry the shard.
- `patterns/async-processing` — Queues in a design: 202 Accepted and background work, transactional outbox, change data capture (CDC), fan-out, webhooks (delivering events to outside systems with retries, backoff, signatures, and replay).
- `patterns/news-feed` — Building a home feed: fan-out on write, on read, and the hybrid for accounts with many followers.
- `patterns/cqrs` — Separate models for writes and reads (CQRS), read views kept up to date from a stream, and event sourcing as a separate choice.
- `patterns/sagas` — Business transactions across services and outside systems: a saga's steps and compensations, orchestration and choreography, timeouts and retries, keeping the state of a saga, the "design a payment system" task.
- `patterns/vector-search` — Similarity search over embeddings: exact and approximate indexes, filters, recall.
- `patterns/counting` — Counting at scale: likes and views, sharded counters and batched updates, approximate counts (HyperLogLog, Count-Min Sketch), top-K and trending items, leaderboards.
- `patterns/search` — Building a search feature on top of a search engine: the indexing pipeline, how fresh the index is, ranking, autocomplete (tries and prefix indexes), the "design typeahead" task.
- `patterns/large-files` — Uploading and serving large files: chunks, resumable uploads, deduplication, processing pipelines such as video transcoding, adaptive streaming.
- `patterns/job-scheduling` — Delayed and periodic jobs across many servers: a distributed cron, running a job once, retries, priorities, the "design a job scheduler" task.
- `patterns/ledger` — Keeping money right: double-entry bookkeeping, entries that never change, balances derived from entries, reconciling with outside systems.
- `patterns/offline-sync` — Apps that work without a network: a local copy on each device, syncing changes later, merging concurrent edits (CRDTs, operational transformation), real-time collaboration.

## Technologies

- `technologies/api-styles` — REST, gRPC, GraphQL; HTTP methods, status codes, idempotent methods; versioning, pagination (cursor and offset), errors, long-running operations.
- `technologies/load-balancers` — Forward and reverse proxies, balancing algorithms in depth, sticky sessions, hash routing, connection draining, running out of ports and the connection backlog, global load balancing; NGINX, Envoy, HAProxy.
- `technologies/cdn` — How a CDN works, anycast routing to a nearby edge, what to cache on it, invalidation.
- `technologies/webrtc` — How WebRTC connects peers: NAT, STUN, TURN, signaling.
- `technologies/postgresql` — PostgreSQL: B-tree storage, index types, EXPLAIN and query plans, a process per connection and connection pools, PostGIS, when to pick it.
- `technologies/kafka` — Kafka: topics and partitions, consumer groups, retention, and replay, copying topics to another region.
- `technologies/rabbitmq` — RabbitMQ: a queue broker, exchanges and routing, acknowledgments, dead-lettering; when a queue fits better than a log.
- `technologies/flink` — Flink: stream processing with event time, windows, watermarks, state, and checkpoints.
- `technologies/spark` — Spark: batch processing over large data sets.
- `technologies/temporal` — Temporal: durable workflows for running sagas and long processes.
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
- `technologies/distributed-sql` — Distributed SQL databases (CockroachDB, YugabyteDB, and the Spanner design they follow): sharding, consensus, and transactions across nodes inside one database.
- `technologies/etcd` — etcd and ZooKeeper: coordination services for configuration, leader election, and locks.
- `technologies/kubernetes` — Kubernetes: running services in containers, deployments and rollouts, service discovery, autoscaling.
- `technologies/opentelemetry` — OpenTelemetry: collecting metrics, logs, and traces in one format.
- `technologies/time-series-databases` — Time-series databases (Prometheus, InfluxDB, TimescaleDB): ingestion, retention, rollups, cardinality.

## Framework

- `framework` — The whole design interview, one block per step: how the interview runs and what interviewers check; functional requirements (users and their main actions, core scenarios, scope, when to move on); non-functional requirements and estimates; API and data model; high-level design; deep dives, picked by the type of system; presenting the design and defending trade-offs. Each block gives the purpose of the step, example questions, expected outputs, and time to spend.

## Practices

- `practices/testing` — Kinds of tests and what each one catches: unit, integration, contract tests between services, end-to-end; testing failures (fault injection, chaos experiments).
- `practices/load-testing` — Finding the limits of a system: open and closed load models, coordinated omission, finding the bottleneck, capacity planning.
- `practices/releases` — Getting changes to production safely: CI/CD, rolling, blue-green, and canary releases, feature flags and configuration, rolling back, database schema changes (links to `patterns/data-migration`).
- `practices/code-review` — What to check in a change, keeping changes small, reviewing a design.
- `practices/design-docs` — Describing and defending a technical decision: RFCs, architecture decision records, alternatives and trade-offs.
- `practices/refactoring` — Changing code that already works: legacy code, technical debt, replacing a system step by step (strangler fig).
- `practices/operations` — Running a system: on-call, incidents, postmortems, runbooks.

## Systems

- `systems/ride-hailing` — A ride-hailing service such as a taxi app: a trip as a state machine, driver locations streaming in, matching riders with drivers, ETA and surge pricing, payments, several regions.
- `systems/url-shortener` — A complete URL shortener design, from requirements and estimates to APIs, data storage, short code generation, caching, and scaling. Compares alternatives and explains when to choose each one.
