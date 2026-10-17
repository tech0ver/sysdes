---
title: Databases
description: What shape to give data and where to keep it, from relational tables to documents, wide-column, graph, search, and vector stores.
---

Every system design says where each kind of data lives, and that choice decides which queries are cheap, which rules the data can enforce, and how many copies must be kept in sync. To defend it, you need to know the shapes data can take, the store that fits each shape, and when a second store is worth its cost.

## Storing each fact once

A photo-sharing network starts with users, posts, comments, likes, and follows. Before you pick a store, list what the app asks and what must stay correct:

- open a post with its author's name;
- page through a post's comments in order;
- show whom a user follows and who follows them;
- a user likes a post at most once;
- a follow goes one way: following someone does not make them follow back;
- deleting an account removes its likes and follows.

The **relational model** fits this list. Data lives in tables of rows, and each row has a primary key. A row refers to another row by storing that row's key in a **foreign key** column. A one-to-many relation needs only this column: a post stores `author_id`, a comment stores `post_id`. A many-to-many relation, such as likes, gets its own table that joins the two sides:

```sql
CREATE TABLE likes (
  user_id    bigint REFERENCES users ON DELETE CASCADE,
  post_id    bigint REFERENCES posts ON DELETE CASCADE,
  created_at timestamptz NOT NULL,
  PRIMARY KEY (user_id, post_id)
);

CREATE INDEX ON likes (post_id);
```

The primary key on the pair rejects a second like from the same user and finds a user's likes. The second index finds a post's likes, so the relation is read in both directions. Follows have the same shape: the row `(follower_id, followee_id)` means one user follows another, and following back is a separate row. Frequent queries on the list get indexes this way, such as `(post_id, created_at)` for comments in order (more on [composite indexes](../storage-engines/#searching-by-other-columns)). A query says what it needs, and the database picks the indexes and how to combine the tables. A new query can use the same tables right away, and an index makes it fast when it picks a few rows; a query that combines or counts many rows may still need a precomputed result.

::diagram{name="relational-tables"}

**Normalization** keeps each fact in one place, and everything else refers to it by key. A user's name lives only in `users`; posts and comments store `author_id`. A rename is one update, and no post keeps the old name. Normalization is about correctness: when a fact has several copies, an update that misses one leaves them disagreeing. The price is paid on reads. To show a post with its author's name, a **join** matches the post's `author_id` to a row in `users`.

**Constraints** make the database enforce the rules, so a bug in one service cannot break them. The primary key on `likes` blocks the second like, a foreign key blocks a like for a post that does not exist, and `ON DELETE CASCADE` removes an account's likes with it. A change that touches several rows at once, such as deleting a post with its comments, relies on transactions.

PostgreSQL and MySQL are the usual choices here. <!-- link: technologies/postgresql --> <!-- link: technologies/mysql -->

:::do
Keep the core entities in a relational store, normalized. Give each many-to-many relation its own table with a unique key on the pair and an index for each direction. Let constraints enforce the rules that must always hold.
:::

The home feed stays expensive even with these indexes: each time it opens, it merges the latest posts of hundreds of authors.

## Copying data for fast reads

Users open the home feed far more often than they post. A normalized feed repeats the same work on every open: find whom the user follows, take their latest posts, merge and sort them, then join each post to its author's name and count its likes. A read that runs this often can read a copy instead. **Denormalization** stores data a second time, in the shape a read needs. A copy takes one of three forms:

- A copied attribute: the author's name stored in each post row, so a post shows without a join to `users`.
- An aggregate: a `like_count` column on the post, so a view does not count rows in `likes`.
- A precomputed result: each user's feed stored as a ready list, extended when a followed author posts. It is the result of the feed query, computed ahead of time.

The read becomes one indexed range of a single user's rows:

```sql
SELECT post_id, author_id
FROM feed_entries
WHERE user_id = ?
ORDER BY created_at DESC
LIMIT 50;
```

Every copy moves work to writes. A new post becomes one feed row per follower, a like updates the counter as well as `likes`, and a rename must reach every post that holds the old name. A copy also takes space, and it can disagree with the original. So name what updates each copy. Updating it in the same transaction as the original keeps it exact but makes the write slower, and a busy counter becomes a point where writes wait for each other. Updating it later in the background is cheaper, but the copy lags behind. Putting posts into followers' feeds has its own trade-offs, such as authors with millions of followers. <!-- link: patterns/news-feed -->

::diagram{name="feed-read-vs-write"}

Copy what rarely changes, and keep IDs for what changes often. In 2012, each entry of Twitter's home timeline held only the post ID, the author's ID, and a few flags, and the service looked up the rest on each read ([talk](https://www.infoq.com/presentations/Twitter-Timeline-Scalability/)). Text, names, and counts change often, and a copy of them in every timeline would turn each change into millions of updates. Copy a name only when the product states how stale it may be, or when it must show the value as it was at that moment. Such a copy keeps the value from that moment and does not follow later renames.

:::do
Read normalized data with good indexes first. Denormalize one hot read that you measured, and state how fresh the copy must be and what updates it.
:::

## Loading a record in one read

A post is more than one row now: a caption, several photos in a set order, tags, a place, sometimes a poll. Each photo entry holds a reference to the file, its size, and its position; the file itself is stored elsewhere. The post page shows all of it at once. Normalized, that is a post row plus rows in `post_photos`, `post_tags`, and `poll_options`: several queries, or joins that repeat the post row next to each photo.

The **document model** keeps such a tree in one record, usually JSON:

```json
{
  "id": 81,
  "author_id": 42,
  "caption": "Sunset at the pier",
  "photos": [
    { "file": "p81-1.jpg", "width": 1080, "height": 1350 },
    { "file": "p81-2.jpg", "width": 1080, "height": 1080 }
  ],
  "tags": ["sunset", "sea"],
  "place": { "name": "Santa Monica Pier", "lat": 34.009, "lon": -118.497 }
}
```

One request returns the whole tree, because the store keeps the record together. This is **locality**: data used together is stored together, so reading it takes fewer lookups.

The design question is what goes inside the record. Embed a part when the record owns it, its size stays bounded, and it is read and changed with the record, such as the photo list or the poll options. Reference a part, that is, store it separately and keep its ID, when it grows without bound, is shared by many records, or is read on its own. A popular post gets thousands of comments, which are paged separately, and one author has many posts, so both stay references, like `author_id` above.

::diagram{name="embed-vs-reference"}

The model fits trees well and links between records poorly. Likes and follows connect many records to many, and many document stores join weakly or not at all, so the app runs several queries and joins the results in its code. A large document costs more to read and to change, by how much depends on the engine, and products cap its size: [16 MiB per document in MongoDB](https://www.mongodb.com/docs/manual/reference/limits/#mongodb-limit-BSON-Document-Size), [400 KB per item in DynamoDB](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Constraints.html#limits-items-size). <!-- link: technologies/mongodb --> <!-- link: technologies/dynamodb --> In MongoDB [a write to one document is atomic](https://www.mongodb.com/docs/manual/core/write-operations-atomicity/), so a post and its photo list change together; an atomic change across documents needs a transaction.

A relational store can keep the same tree in one row: a JSON column holds the photo list next to the typed columns, and [PostgreSQL](https://www.postgresql.org/docs/current/datatype-json.html) and [MySQL](https://dev.mysql.com/doc/refman/8.4/en/json.html) both support it.

:::do
Keep the current store and embed the bounded parts that a record owns, for example in a JSON column. Choose a document store when most reads and writes take whole records and links between records are rare.
:::

## Records with different fields

The app adds post types: a video has a duration and a cover frame, a poll has options and an end date, a shared link has a URL and a preview. Each type has its own fields, and new types keep coming. There are four ways to store them:

- a table per type: strict, but each new type is a new table, and a feed of mixed posts has to combine all of them;
- one wide table with a column for every field: each row leaves most columns empty, and each new field changes the table;
- a JSON column for the fields that vary;
- a document store, where each record carries its own fields.

The choice turns on where the structure is checked. A **schema** is the structure that records follow. With **schema-on-write**, the database checks every write against it, as a relational table does. With **schema-on-read**, the store does not check records on write, and the code that reads them decides what the fields mean. "Schemaless" is a misleading name: the reading code still expects a structure, and it must handle every shape that was ever written.

::diagram{name="schema-check"}

Changing the structure costs differently. With schema-on-write, a migration changes the table. Adding a column that may be empty is usually cheap, while changing a column's type can rewrite or lock the whole table; the details depend on the operation and the database. With schema-on-read, new records take the new shape at once, and old records keep the old one until something rewrites them. Either way, the change has to be timed with the app's releases.

Most designs mix the two. Typed columns hold what the database must filter, join, or check, and a JSON column holds the rest:

```sql
CREATE TABLE posts (
  id         bigint PRIMARY KEY,
  author_id  bigint NOT NULL REFERENCES users,
  type       text NOT NULL,
  created_at timestamptz NOT NULL,
  payload    jsonb NOT NULL
);
```

The database makes sure that every post has an existing author and a type, and a `CHECK` constraint can also limit `type` to known values. Each type keeps its own fields in `payload`. PostgreSQL can [index fields inside the JSON](https://www.postgresql.org/docs/current/datatype-json.html#JSON-INDEXING) when a query filters on them. The two models have grown toward each other: relational stores added JSON types and indexes, and MongoDB added [joins](https://www.mongodb.com/docs/manual/reference/operator/aggregation/lookup/) and [schema validation](https://www.mongodb.com/docs/manual/core/schema-validation/).

:::avoid
Treating a schemaless store as a reason to skip designing the records. The reading code still depends on their structure, and every old shape stays in the data until it is rewritten.
:::

:::do
Use typed columns plus a JSON column in the relational store. Choose a document store when most records are independent trees with varied fields.
:::

## Storing files

Each post carries photos and videos: a photo takes a few megabytes, a video can take hundreds. A file is written once and then read many times, by viewers all over the world. Kept in database rows, files would make tables and backups huge, and every view would pull its bytes through the database server.

**Object storage** is built for such files. It keeps objects, each a file plus a little metadata, under keys in one flat namespace, and the app writes and reads whole objects over HTTP. A "folder" is only a shared prefix of keys. Space is cheap, the store grows without limit, and a CDN in front of it serves the files from servers near the viewers (more on [serving users far away](../networking/#users-far-away)). The price is a second place to manage: an upload and its metadata row, or a delete and its file, now happen in two stores, and many requests and data transfers are billed, which a busy media feed must budget for. Amazon S3 is the best-known one, and other clouds offer the same model. <!-- link: technologies/object-storage -->

The database keeps the metadata and the object key, such as the `file` reference in the post record. Treat a key as immutable: an edited photo gets a new key, so caches and old references never mix two versions. The store allows overwrites, so this rule lives in the app. The client uploads a file straight to the store with a **pre-signed URL**, a link that allows uploads to one key until it expires, and the post stays pending until the upload completes. The link works more than once while it lasts, so keep its lifetime short.

::diagram{name="media-upload"}

Durability and availability are different promises. S3 is [designed for 11 nines of durability](https://aws.amazon.com/s3/storage-classes/), so a stored object is almost never lost. It may still be briefly unreachable: S3 Standard is designed for 99.99% availability, and its SLA promises 99.9%.

:::do
Keep large media in object storage and their metadata in the database. Keep a small binary value in a database row only for a concrete benefit, such as writing it in the same transaction as the row.
:::

## Looking up by key only

Some data is only ever read by its full key. A session maps a token to a user and is checked on every request. A feature flag is read by its name. A map from each media ID to the account that owns it is checked on every media request. Each read has the whole key, and nothing asks what is inside the values:

```text
session:7f3a9c  →  {"user_id": 42, "expires": "2026-10-13T10:00Z"}
flag:new-editor →  {"enabled": true, "percent": 10}
media:981       →  {"owner_id": 42}
```

The **key-value model** offers exactly this: get, put, and delete by the full key. The value is opaque to the store, so it cannot find records by a field inside the value. In return, every operation goes to one place that the key alone determines, which makes the data [easy to spread across machines](../sharding/#choosing-the-shard-key). Many key-value stores can also delete a key after its TTL. For sessions, still check the expiry on every read: a store may remove expired keys [some time later](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/TTL.html). Such a store may keep its data in RAM or on disk (more on [keeping data in memory](../storage-engines/#back-to-memory)), and it often serves as a cache in front of another store. <!-- link: fundamentals/caching --> Redis and DynamoDB are common choices. <!-- link: technologies/redis -->

The model stops at the key. "All sessions of this user" or "flags changed today" needs a field or a range of keys, which a plain key-value store does not have. Some stores add them: DynamoDB has [a second key that orders items sharing the first one](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/HowItWorks.CoreComponents.html#HowItWorks.CoreComponents.PrimaryKey), chosen when the table is created, and [secondary indexes](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/HowItWorks.CoreComponents.html#HowItWorks.CoreComponents.SecondaryIndexes).

::diagram{name="key-value"}

:::do
Start with an indexed lookup by key in the existing store. Add a key-value store when measured load or latency needs it and every read has the full key. When queries need a field or a range, use a store with ordered keys or indexes.
:::

## Designing from the queries

The network adds direct messages. Users send billions of them, a message is rarely changed after it is sent, and the history is kept for years. Before choosing where messages live, list the queries with how often they run, how fast they must be, and what must stay correct:

1. Send a message to a chat: very frequent; a sent message must not be lost, and a chat keeps one order.
2. Read the latest 50 messages of a chat, then older pages: the most frequent read, and it must be fast.
3. List a user's chats, the most recent first, with unread counts: on every app open.
4. Delete all messages of a deleted account: rare, but required.

Every query, the rare ones too, needs a path to its data. A relational store adds paths later: a new query usually needs only a new index, and joins combine tables at read time.

Stores without joins or flexible indexes commit the layout to the queries instead. Each query gets a table shaped for it, often named after it: `messages_by_chat` for the second query, `chats_by_user` for the third. A write goes to every table that holds a copy, and a new query often means a new table and a **backfill**, a job that copies the existing data into it. `messages_by_chat` is keyed by chat, so the fourth query, finding one user's messages, needs another table or a scan of everything. Table per query is the common strategy in such stores, though newer Cassandra versions have [indexes on other columns](https://cassandra.apache.org/doc/latest/cassandra/developing/cql/indexing/sai/sai-concepts.html), and a query by such an index may have to ask every machine. <!-- link: technologies/cassandra -->

::diagram{name="table-per-query"}

:::interview
Name the queries before the store. List them with their rates and correctness needs, then pick a model that serves all of them, and say which query each table or index is for.
:::

:::do
Design from the data and the queries in a relational store, and add indexes as queries appear. When the chosen store requires a layout per query, list every query, the rare ones included, before creating tables.
:::

The messages need a layout that keeps one chat's messages together and in order.

## Keeping related rows together in order

The `messages_by_chat` table must return a chat's newest messages fast, while the network writes millions of messages across many machines. The **wide-column model** stores rows in partitions. The **partition key** decides which partition holds a row, and so which machines store it. A **clustering key** sorts the rows inside the partition. A query names a partition and reads a range of its sorted rows:

```sql
CREATE TABLE messages_by_chat (
  chat_id    bigint,
  bucket     int,
  message_id bigint,
  sender_id  bigint,
  body       text,
  PRIMARY KEY ((chat_id, bucket), message_id)
) WITH CLUSTERING ORDER BY (message_id DESC);
```

The partition key is what the query filters on: here the chat together with a time bucket. The clustering key is `message_id`: it must be unique, or a write with the same key silently updates the existing row, and it must sort by time. A `created_at` timestamp sorts by time but is not unique, so message IDs are generated to grow over time. Reading the latest 50 messages then starts with one range read in the newest partition. Writes are cheap, because these stores sort writes in memory and flush them to disk in batches (more on [LSM-trees](../storage-engines/#sorting-writes-in-memory)).

The layout serves only the queries it was built for. There are no joins, the sort order is fixed when the table is created, and a query without the full partition key may have to ask every machine.

A partition must also stay bounded. One chat that lives for years would grow into a partition too large to read, compact, or move between machines. So the partition key gets a time bucket: `(chat_id, bucket)` starts a new partition every few days or weeks. Size the bucket from the worst case: the busiest chat's message rate times message size times the bucket's length. When the newest bucket holds fewer than 50 messages, the read continues in older buckets until the page is full. Discord stored messages this way in 2017, with buckets of about 10 days, to keep partitions under 100 MB after Cassandra logged warnings about larger ones ([Discord blog](https://discord.com/blog/how-discord-stores-billions-of-messages)). A very busy chat can still become a hot key: all its writes go to the current bucket, on the same few machines.

::diagram{name="wide-column-partitions"}

DynamoDB uses the same idea of [a partition key and a sort key](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/HowItWorks.CoreComponents.html#HowItWorks.CoreComponents.PrimaryKey), with [its own limits](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Constraints.html#limits-partition-sort-keys).

:::do
Serve ordered reads from the relational store first: an index on `(chat_id, message_id)` returns the latest messages too. Choose a wide-column store when measured write load needs many machines, the queries are known in advance, and every partition stays bounded. A large amount of data alone is not a reason.
:::

## Following links many steps deep

"People you may know" suggests the users followed by the people you follow, ranked by how many of your follows also follow them. That is two hops through the follows table: a bounded join of the table with itself, or a list computed in the background and stored. It stays in the relational store.

The trust and safety team asks a different kind of question. Fake accounts come in rings: they share phones, IP addresses, and reposted photos, and the links between them can run through any number of steps. An investigator starts from one account and asks how it connects to accounts already banned, and asks it again with every new clue.

The **graph model** fits such questions. Data is vertices, such as accounts, devices, and photos, and edges between them, both with properties. A query follows stored edges from vertex to vertex, so paths of unknown length and patterns of links are easy to express:

```cypher
MATCH path = (a:Account {id: $id})-[*1..6]-(b:Account {banned: true})
RETURN path
LIMIT 10;
```

This finds paths of up to six links of any type from one account to a banned one. In SQL each hop is a join, and an unknown number of hops needs a recursive query that is hard to write and to tune. Edges have a direction: a follow is an edge from the follower to the followed user. Any model struggles with a vertex that has a huge number of edges, such as a celebrity with 100 million followers: a query that walks all its edges is slow wherever they are stored. A graph database is one more store to run and fill: when the relational store owns the accounts and posts, the graph is a copy that must follow it. Neo4j is the best-known graph database. <!-- link: technologies/neo4j -->

::diagram{name="graph-hops"}

The social graph itself does not need a graph database. In 2013, Facebook described serving its graph of users, posts, and links from MySQL, split across many servers, behind a cache that understands objects and links ([TAO paper](https://www.usenix.org/system/files/conference/atc13/atc13-bronson.pdf)).

:::do
Keep links in an edges table, or store precomputed results, in the relational store. Choose a graph database when the product needs interactive queries over paths and patterns of unknown depth and measured performance shows the relational store cannot serve them.
:::

## Measuring over time

The network measures itself. Each service reports its request rate, latency, and errors every 10 seconds, and on-call engineers watch dashboards and get alerts. Creators also see how many views their posts get per hour. Both are measurements over time, but at very different volumes.

The platform's own metrics live in a **time-series store**, usually as part of the monitoring stack. Its workload has a typical shape. Points arrive mostly in time order and are appended. Queries ask the same questions over recent windows: the rate, average, or 99th percentile over the last five minutes. Old data goes by **retention**, the period the store keeps data: many stores keep data in time blocks and drop a whole expired block at once, which is far cheaper than deleting rows one by one. **Rollups** store older data at a lower resolution, such as one point per hour, when long history must stay affordable; some stores compute them, others leave it to you. A query names a metric, filters it by labels, and applies a window:

```promql
rate(http_requests_total{service="feed", status="500"}[5m])
```

::diagram{name="time-blocks"}

A series is a metric name plus one combination of label values. In Prometheus, [every combination is a separate series](https://prometheus.io/docs/practices/naming/#labels), so a label with unbounded values, such as a user ID or a post ID, multiplies the series and the memory they need. Other stores handle many series differently, so check the product before you add such a label. Prometheus, InfluxDB, and TimescaleDB are common choices. <!-- link: technologies/time-series-databases --> How services produce these metrics is part of observability. <!-- link: fundamentals/observability -->

While creators' views per hour stay a modest stream, they fit in the main store: one row per post per hour, in a table with the key `(post_id, hour)`.

:::do
Keep platform metrics in the monitoring stack. Keep modest app measurements in a table indexed by time. Move them to a time-series store when the table no longer meets the write rate, the window queries, or the retention.
:::

## Answering new questions over all events

Creators and the product team ask new questions every week: views of this post by country and day, how many new users come back after a week, which post types grow. Each view, like, and signup is recorded as an event, one row each, with the post, the user, the country, and the time. The questions group and join these events across months of history:

```sql
SELECT country, CAST(viewed_at AS date) AS day, count(*) AS views
FROM view_events
WHERE post_id = ?
  AND viewed_at >= now() - INTERVAL '30 days'
GROUP BY country, day
ORDER BY day, views DESC;
```

This is analytics: large scans that read a few columns of many rows. On the app's database they compete with its own work, so the events go to a separate **analytics store** with column storage (more on [scanning for analytics](../storage-engines/#scanning-for-analytics)). ClickHouse, Apache Druid, and Apache Pinot are common open-source choices, and cloud warehouses such as BigQuery, Snowflake, and Redshift serve the same workload as managed services. <!-- link: technologies/clickhouse -->

The difference from time-series lies in the typical workload, and both may use column storage. A time-series store mostly answers repeated window questions over regular measurements, such as error rates. An analytics store mostly answers new questions over business events with many fields, such as the post, the user, and the country, and keeps the raw events, so tomorrow's question can still be asked about last year.

A number that the app shows on every page view, such as a creator's daily views, is better computed ahead as a rollup than scanned each time. A query on demand against the analytics store is fine when it is bounded, such as one post over 30 days, and measured latency and load allow it. Events reach the analytics store in batches or as a stream, so reports lag behind the app. <!-- link: fundamentals/data-processing -->

::diagram{name="analytics-store"}

:::do
Use counters or rollups for numbers the app shows all the time. Add an analytics store when exploratory queries scan enough data to slow the app.
:::

## Searching by words

Users search posts by words in captions and by hashtags, and people by name, often with a typo. A B-tree index sorts whole values, so it cannot narrow a search for a word inside a caption: without another kind of index, `LIKE '%sunset%'` reads every row.

An **inverted index** maps each word to the list of records that contain it. A query that needs both of two words takes both lists and keeps the records found in both. Before indexing, text analysis splits the text into words and normalizes them, for example to lowercase; with stemming on, it also reduces each word to its stem by the rules of its language, so "running" also finds "run". The search then ranks the matches by relevance, such as how often and where the words appear, and fuzzy matching finds words that differ by a typo or two.

::diagram{name="inverted-index"}

The main store may already do this. PostgreSQL has [full-text search](https://www.postgresql.org/docs/current/textsearch.html) with an inverted index and ranking, and [trigram similarity](https://www.postgresql.org/docs/current/pgtrgm.html) for names with typos:

```sql
SELECT id
FROM posts, websearch_to_tsquery('english', 'beach sunset') AS q
WHERE search_vector @@ q
ORDER BY ts_rank(search_vector, q) DESC
LIMIT 20;
```

Here `search_vector` is a column computed from the caption and hashtags, with an inverted index on it.

A **search engine** goes further: analysis tuned per language, finely controlled relevance, counts by category next to the results (facets), and its own machines that scale apart from the main store. Elasticsearch and OpenSearch are the common choices. <!-- link: technologies/elasticsearch --> It holds a copy of the data, built from the stores that own it and updated in the background. A change appears in search after the copy receives it and the engine refreshes its index; in a cluster you run, Elasticsearch [refreshes every second by default](https://www.elastic.co/guide/en/elasticsearch/reference/current/near-real-time.html) for indexes searched recently, and a setting changes it. Here the relational store stays the owner: the engine does not enforce the rules across records that the app needs, such as foreign keys.

:::do
Start with full-text search in the main store. Add a search engine when the product needs behavior the store lacks, such as per-language analysis, tuned relevance, or facets, or when search load needs its own machines.
:::

## Searching by meaning

"Similar posts" should find posts about the same thing, and a search for "beach sunset" should find a post captioned "evening at the sea", which shares no words with it.

An **embedding** model turns a text or an image into a vector: a list of hundreds or thousands of numbers. Texts with similar meaning get vectors that lie close to each other. A query is turned into a vector by the same model, and the search returns the nearest vectors. Vectors from different models cannot be compared, so changing the model means computing the vectors of all records again.

::diagram{name="vector-space"}

Exact search compares the query with every vector. It is fine for small sets, or when a filter first narrows the candidates to a small set. Approximate indexes, such as HNSW and IVF, visit only part of the vectors, so they are much faster, but they can miss some true neighbors. **Recall** is the share of true nearest neighbors that a search returns, and an index trades it for speed and memory. Filters need care: in [pgvector](https://github.com/pgvector/pgvector#filtering), a filter is applied after the approximate index scan, so a selective filter can leave too few results; iterative scans or another filtering strategy help, within their limits.

pgvector keeps the vectors in PostgreSQL, next to the rest of the post:

```sql
SELECT id
FROM posts
WHERE NOT hidden
ORDER BY embedding <=> ?
LIMIT 20;
```

The `<=>` operator is the cosine distance between two vectors. The post's other fields stay in normal columns with normal indexes, linked to the vector by the post ID. The nearest vectors are candidates: the app still removes deleted posts and blocked authors, and ranks the rest. Search engines also store vectors, and dedicated vector databases, such as Milvus, Qdrant, and Weaviate, are built for vector search first, often with keyword search too. <!-- link: patterns/vector-search -->

:::do
Keep vectors in a store you already run: pgvector in PostgreSQL, or the search engine. Choose a dedicated vector database when measured recall with filters, latency, memory, or the time to rebuild the index require it.
:::

## Deciding who owns each fact

The network now keeps data in several stores, and many facts exist in more than one of them. A post's caption is in the relational store, in the search index, and, as a vector, in the similarity index. When the copies disagree, one of them must be right.

Each fact needs one owner, the **system of record**: the store where the fact is written first and which wins any disagreement. Here the relational store owns users, posts, likes, and follows; the message store owns messages; object storage owns the media files; and raw view events are owned by the store where they are first recorded, such as an event log that feeds analytics. Everything else is **derived data**: the feeds, the counters, the search index, the vectors, and the rollups are built from the owners. A derived copy can be rebuilt only while its inputs are kept. Rollups need the raw events, and vectors need the posts and the same model.

::diagram{name="ownership-map"}

Each derived copy needs two promises. The first is how far behind the owner it may be: seconds for search, minutes or hours for analytics reports. The second is how deletes reach it: a deleted post must leave the feeds, the search index, and the similarity index, and its files must go too.

The simplest way to update copies is to have the app write to each store in turn: first the main store, then the search engine. These **dual writes** break in two ways. One write can fail while the other succeeds. And two concurrent updates of the same post can reach the two stores in different orders, so the stores keep different versions, with no error anywhere.

Instead, derived copies follow the owner's committed changes. **Change data capture** (CDC) reads the changes from the owner's log after they commit. An **outbox** writes each change as an event into a table in the same transaction as the change itself, and a separate process delivers the events. Either way, the changes of one record must be applied in the order they were made, and a retry may deliver a change twice, so applying it twice must have no extra effect. <!-- link: patterns/async-messaging --> <!-- link: fundamentals/async-communication -->

::diagram{name="dual-writes-vs-cdc"}

Keeping separate models for writes and reads is also a pattern of its own, CQRS. Event sourcing, where the log of events is the owner and every table is derived from it, is a separate choice. <!-- link: patterns/cqrs -->

:::do
Add a store only when its benefit pays for keeping it in sync. For each copy, name its owner, how far behind it may be, and how deletes reach it.
:::

## Choosing a store

Most data starts in the relational store, and each move to another store needs a concrete reason in the workload or the product:

| Data and its main query | Model | Default | Switch when |
|---|---|---|---|
| Users, posts, likes, follows: reads with joins, rules that must hold | Relational | Normalized tables with indexes for frequent queries | A measured hot read needs a copy: denormalize that read, keep the store |
| A post with its photos, tags, and poll: read whole | Document | A JSON column in the relational store | Most reads and writes take whole records, and links between records are rare |
| Post types with different fields | Typed columns and JSON, or document | Typed columns plus a JSON column | Most records are independent trees with varied fields |
| Photos and videos: written once, read many times | Object storage | Object storage behind a CDN, metadata in the database | A small binary value gains something concrete from living in a row |
| Sessions, flags: read by the full key | Key-value | An indexed lookup in the existing store | Measured load or latency needs it, and every read has the full key |
| Messages: the latest N of a chat, many writes | Wide-column | A relational table with an index on `(chat_id, message_id)` | Write load needs many machines, queries are known, partitions stay bounded |
| Links between accounts: paths of unknown depth | Graph | An edges table or precomputed results | Interactive path queries are required and the relational store measurably cannot serve them |
| Measurements over time: window queries | Time-series | The monitoring stack for platform metrics, a table indexed by time for app numbers | The table no longer meets the write rate, the window queries, or the retention |
| Events for new questions: large scans | Analytics, column storage | Counters or rollups | Exploratory queries scan enough data to slow the app |
| Text: search by words | Inverted index | Full-text search in the main store | The product needs behavior the main store lacks, such as per-language analysis, tuned relevance, or facets, or search needs its own machines |
| Posts and images: search by meaning | Vectors | pgvector or the search engine | Measured recall with filters, latency, memory, or rebuild time require a dedicated store |

Each fact still has one owner. The feeds, counters, search index, vectors, and rollups are copies that follow their owners, with a stated delay, and every delete must reach them.

## Cheat sheet

- List the queries and the rules that must hold before you pick a store. Keep core entities in normalized relational tables: a join table per many-to-many relation, indexes for frequent queries, constraints for the rules.
- Read normalized data with good indexes first. Denormalize one measured hot read, with a stated freshness and a named process that updates it; copy what rarely changes and keep IDs for what changes often.
- Embed the bounded parts a record owns and reference what grows without bound, is shared, or is read alone. Use a JSON column first; choose a document store when most access takes whole records and links between records are rare.
- Records always have a structure: schema-on-read only moves the check to the reading code. Use typed columns plus a JSON column; choose a document store when most records are independent trees with varied fields.
- Keep large media in object storage behind a CDN, and their metadata and keys in the database. Durability is not availability.
- Start with an indexed lookup by key in the existing store. Add a key-value store when measured load or latency needs it and every read has the full key.
- Give every query a path, the rare ones too. A relational store adds paths with indexes; stores without joins or flexible indexes usually get a table per query and a backfill for each new one.
- Serve ordered reads from the relational store first. Choose a wide-column store when measured write load needs many machines, queries are known, and every partition stays bounded, for example by a time bucket; data size alone is not a reason.
- Keep links in an edges table or precompute results. Choose a graph database when interactive queries over paths of unknown depth are required and the relational store measurably cannot serve them.
- Keep platform metrics in the monitoring stack and modest app measurements in a table indexed by time. In Prometheus, a label with unbounded values, such as a user ID, multiplies the series and their memory.
- Use counters or rollups for numbers the app shows all the time. Add an analytics store when exploratory scans slow the app; time-series stores mostly serve repeated window questions, analytics stores mostly serve new questions over raw events.
- Start with full-text search in the main store. Add a search engine when the product needs behavior the main store lacks, such as per-language analysis, tuned relevance, or facets, or search needs its own machines; it holds a copy that lags.
- Keep vectors in a store you already run. Choose a dedicated vector database when measured recall with filters, latency, memory, or rebuild time require it.
- Give each fact one owner. A copy in the same store can change in the same transaction as the original; a copy in another store follows the owner's committed changes through CDC or an outbox rather than dual writes. Each copy has a stated delay and receives deletes.
