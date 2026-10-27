// The site glossary. One entry per term.
//
// - `term`: the name shown in the glossary. Keep the official spelling of names and
//   abbreviations (OpenAPI, GraphQL, gRPC, TCP). Start common words with a capital letter
//   (Failover, Exponential backoff).
// - `aliases`: exact spellings to find in articles (case-sensitive). Defaults to [term] plus
//   the same with a lowercase first letter, so "Failover" also finds "failover".
// - `expansion`: what an abbreviation stands for. Only for abbreviations.
// - `short`: one sentence that fits any context. Shown in the tooltip.
// - `explanation`: two or three sentences: what it is and why it matters in a design.
// - `readMore`: where to read more. `href` is a site path (no leading slash, may have `#anchor`)
//   or a full external URL. A page that is the `readMore` of a term explains it in its own text,
//   so the term gets no tooltip on that page.
// - `explainedIn`: other pages that explain the same word in their own sense ("consistency" in
//   ACID versus between copies), so the term gets no tooltip there either.
//
// Write in simple English. Keep `short` and `explanation` true in any context.

const networking = (anchor, section) => ({
	href: `fundamentals/networking/#${anchor}`,
	label: `Networking: ${section}`,
});

const storageEngines = (anchor, section) => ({
	href: `fundamentals/storage-engines/#${anchor}`,
	label: `Storage engines: ${section}`,
});

const databases = (anchor, section) => ({
	href: `fundamentals/databases/#${anchor}`,
	label: `Databases: ${section}`,
});

const transactions = (anchor, section) => ({
	href: `fundamentals/transactions/#${anchor}`,
	label: `Transactions: ${section}`,
});

const replication = (anchor, section) => ({
	href: `fundamentals/replication/#${anchor}`,
	label: `Replication: ${section}`,
});

const sharding = (anchor, section) => ({
	href: `fundamentals/sharding/#${anchor}`,
	label: `Sharding: ${section}`,
});

const postgresql = (anchor, section) => ({
	href: `technologies/postgresql/#${anchor}`,
	label: `PostgreSQL: ${section}`,
});

/** Phrases that contain a term but are not that term, such as product names. They never get a tooltip. */
const consistency = (anchor, section) => ({
	href: `fundamentals/consistency/#${anchor}`,
	label: `Consistency: ${section}`,
});

const caching = (anchor, section) => ({
	href: `fundamentals/caching/#${anchor}`,
	label: `Caching: ${section}`,
});

const redis = (anchor, section) => ({
	href: `technologies/redis/#${anchor}`,
	label: `Redis: ${section}`,
});

const reservations = (anchor, section) => ({
	href: `patterns/reservations/#${anchor}`,
	label: `Reservations: ${section}`,
});

export const glossarySkip = ['SQL Server', 'commit the layout', 'Recall.ai'];

/** @type {Array<{id: string, term: string, aliases?: string[], expansion?: string, short: string, explanation: string, readMore?: {href: string, label: string}, explainedIn?: string[]}>} */
export const glossary = [
	{
		id: 'client-server',
		term: 'Client-server',
		aliases: ['client-server', 'Client-server'],
		short: 'A model of interaction in which a client requests work or data from a server.',
		explanation:
			'The server handles the request and returns a response. Client and server are roles: the same component can serve one caller and make requests to another component.',
		readMore: networking('the-app-talks-to-the-server', 'The app talks to the server'),
	},
	{
		id: 'api',
		term: 'API',
		expansion: 'Application Programming Interface',
		short: 'A contract that lets one program use another program.',
		explanation:
			'An API says which requests a program accepts and what it returns. In system design, it usually means the network endpoints that clients and other services call.',
		readMore: { href: 'https://en.wikipedia.org/wiki/API', label: 'Wikipedia: API' },
	},
	{
		id: 'http',
		term: 'HTTP',
		expansion: 'Hypertext Transfer Protocol',
		short: 'The request-response protocol of the web.',
		explanation:
			'A client sends a request with a method (GET, POST, …), a path, and headers. The server sends back a status code, headers, and a body. Most public APIs run on HTTP.',
		readMore: networking('agreeing-on-the-format', 'Agreeing on the format'),
	},
	{
		id: 'https',
		term: 'HTTPS',
		expansion: 'HTTP Secure',
		short: 'HTTP sent over an encrypted TLS connection.',
		explanation:
			'HTTPS is the same HTTP, but TLS encrypts it and proves the server is who it claims to be. Today almost all web traffic uses HTTPS.',
		readMore: networking('agreeing-on-the-format', 'Agreeing on the format'),
	},
	{
		id: 'http-2',
		term: 'HTTP/2',
		short: 'A newer version of HTTP that sends many requests over one connection at the same time.',
		explanation:
			'HTTP/2 splits requests into streams on one TCP connection and compresses headers. A lost TCP packet still stops all streams until it is resent.',
		readMore: networking('agreeing-on-the-format', 'Agreeing on the format'),
	},
	{
		id: 'http-3',
		term: 'HTTP/3',
		short: 'The version of HTTP that runs on QUIC instead of TCP.',
		explanation:
			'HTTP/3 keeps the many-streams model of HTTP/2, but a lost packet holds up only the streams whose data it carried. It also sets up connections faster.',
		readMore: networking('agreeing-on-the-format', 'Agreeing on the format'),
	},
	{
		id: 'dns',
		term: 'DNS',
		expansion: 'Domain Name System',
		short: 'The system that turns a domain name into an IP address.',
		explanation:
			'Before a client can connect to example.com, it asks DNS for the address. Answers are cached for the time set by their TTL. DNS can also spread users across servers or regions by returning different addresses.',
		readMore: networking('finding-the-server', 'Finding the server'),
	},
	{
		id: 'ttl',
		term: 'TTL',
		expansion: 'Time To Live',
		short: 'How long a piece of data stays valid before it must be refreshed or dropped.',
		explanation:
			'Caches and DNS answers use a TTL to limit how long stored data can be reused. A short TTL means fresher data but more refreshes. A long TTL means fewer refreshes, but changes spread more slowly.',
		readMore: caching('putting-a-cache-in-front-of-the-database', 'Putting a cache in front of the database'),
	},
	{
		id: 'osi',
		term: 'OSI model',
		aliases: ['OSI model', 'OSI'],
		expansion: 'Open Systems Interconnection model',
		short: 'A model that divides network communication into seven layers.',
		explanation:
			'Each layer describes a different part of communication. The layer numbers help distinguish addressing (L3), transport (L4), and application messages (L7) when discussing protocols and load balancers.',
		readMore: networking('adding-servers', 'Adding servers'),
	},
	{
		id: 'ip-address',
		term: 'IP address',
		aliases: ['IP address', 'IP addresses', 'IP'],
		expansion: 'Internet Protocol address',
		short: 'The number that identifies a device on a network.',
		explanation:
			'IP, the Internet Protocol, delivers packets to these addresses with no guarantees; TCP and UDP run on top of it. DNS maps names to IP addresses.',
		readMore: networking('finding-the-server', 'Finding the server'),
	},
	{
		id: 'port',
		term: 'Port',
		aliases: ['port', 'ports', 'Port'],
		short: 'A number that identifies a program on a machine, so one IP address can serve many programs.',
		explanation:
			'A connection goes to an IP address and a port, for example port 443 for HTTPS. L4 load balancers route traffic by IP address and port.',
		readMore: networking('finding-the-server', 'Finding the server'),
	},
	{
		id: 'tcp',
		term: 'TCP',
		expansion: 'Transmission Control Protocol',
		short: 'A transport protocol that delivers a reliable, ordered stream of bytes over a connection.',
		explanation:
			'TCP opens a connection with a handshake, numbers every byte, and resends what gets lost. This makes it reliable, but a lost packet delays all data after it. HTTP/1.1, HTTP/2, and most databases run on TCP.',
		readMore: networking('delivering-data', 'Delivering data'),
	},
	{
		id: 'udp',
		term: 'UDP',
		expansion: 'User Datagram Protocol',
		short: 'A transport protocol that sends separate messages with no delivery or order guarantees.',
		explanation:
			'UDP has no connection and no resends, so it adds very little delay. The application must handle loss and order itself if it cares. Live audio, video, games, and QUIC use UDP.',
		readMore: networking('delivering-data', 'Delivering data'),
	},
	{
		id: 'quic',
		term: 'QUIC',
		short: 'A transport protocol on top of UDP that gives reliable streams with built-in encryption.',
		explanation:
			'QUIC does what TCP and TLS do together, but each stream recovers from loss on its own. HTTP/3 runs on QUIC.',
		readMore: { href: 'https://en.wikipedia.org/wiki/QUIC', label: 'Wikipedia: QUIC' },
	},
	{
		id: 'tls',
		term: 'TLS',
		expansion: 'Transport Layer Security',
		short: 'The protocol that encrypts a connection and proves the server is who it claims to be.',
		explanation:
			'During the TLS handshake, the client checks the server certificate and both sides agree on keys. After that, all data is encrypted. HTTPS is HTTP over TLS.',
		readMore: networking('securing-the-connection', 'Securing the connection'),
	},
	{
		id: 'mtls',
		term: 'mTLS',
		expansion: 'Mutual TLS',
		short: 'TLS in which both sides show a certificate.',
		explanation:
			'Each side proves who it is to the other, so only known services can connect. It is common for traffic between internal services.',
		readMore: networking('securing-the-connection', 'Securing the connection'),
	},
	{
		id: 'round-trip',
		term: 'Round trip',
		aliases: ['round trip', 'round trips', 'Round trip'],
		short: 'The time for a message to reach the other side and for the answer to come back.',
		explanation:
			'Also called RTT (round-trip time). Every handshake costs at least one round trip, so distance between client and server adds up fast.',
		readMore: { href: 'https://developer.mozilla.org/en-US/docs/Glossary/Round_Trip_Time', label: 'MDN: Round trip time' },
	},
	{
		id: 'keep-alive',
		term: 'Keep-alive',
		short: 'Keeping a connection open after a response, so the next request can reuse it.',
		explanation:
			'Reusing a connection skips the TCP and TLS handshakes. Clients and servers close idle connections after a timeout.',
		readMore: networking('securing-the-connection', 'Securing the connection'),
	},
	{
		id: 'connection-pool',
		term: 'Connection pool',
		aliases: ['connection pool', 'connection pools'],
		short: 'A set of open connections that a client keeps and reuses.',
		explanation:
			'Opening a connection is slow, so services keep a pool of them to databases and other services. The pool size also limits how much load one client can put on a server.',
		readMore: networking('securing-the-connection', 'Securing the connection'),
	},
	{
		id: 'rest',
		term: 'REST',
		expansion: 'Representational State Transfer',
		short: 'An API style built on resources (URLs) and standard HTTP methods.',
		explanation:
			'Each thing is a resource with a URL, such as /orders/42. Clients read and change it with GET, POST, PUT, and DELETE. REST is the default style for public APIs.',
		readMore: { href: 'https://developer.mozilla.org/en-US/docs/Glossary/REST', label: 'MDN: REST' },
	},
	{
		id: 'grpc',
		term: 'gRPC',
		short: 'A framework for calling functions on another service, with binary messages over HTTP/2.',
		explanation:
			'You describe the calls in a .proto file and generate client and server code from it. Messages are small and fast to parse. It is common for service-to-service calls, but browsers cannot call it directly.',
		readMore: { href: 'https://grpc.io/docs/what-is-grpc/introduction/', label: 'grpc.io: Introduction to gRPC' },
	},
	{
		id: 'graphql',
		term: 'GraphQL',
		short: 'An API style where the client sends a query that names exactly the fields it needs.',
		explanation:
			'There is usually one endpoint, and the response has the shape of the query. It avoids over-fetching and many round trips, but caching and rate limiting are harder.',
		readMore: { href: 'https://graphql.org/learn/', label: 'graphql.org: Learn GraphQL' },
	},
	{
		id: 'rate-limit',
		term: 'Rate limit',
		aliases: ['rate limit', 'rate limits', 'Rate limits'],
		short: 'A cap on how many requests a client may send in a period of time.',
		explanation: 'Rate limits protect a service from overload and abuse. Requests over the limit usually get HTTP 429.',
		readMore: networking('when-a-call-fails', 'When a call fails'),
	},
	{
		id: 'idempotency-key',
		term: 'Idempotency key',
		aliases: ['idempotency key', 'idempotency keys', 'Idempotency keys'],
		short: 'A unique ID the client attaches to a request, so the server can recognize a retry of it.',
		explanation:
			'If the same key comes again, the server returns the saved result instead of doing the work twice. Used for payments and orders.',
		readMore: networking('when-a-call-fails', 'When a call fails'),
	},
	{
		id: 'polling',
		term: 'Polling',
		short: 'The client asks the server for new data again and again on a timer.',
		explanation: 'Polling is simple and works everywhere. The cost is delay (up to one interval) and many empty requests.',
		readMore: networking('pushing-new-messages', 'Pushing new messages'),
	},
	{
		id: 'long-polling',
		term: 'Long polling',
		aliases: ['long polling', 'Long polling'],
		short: 'The server holds a request open until it has new data or a timeout, then the client asks again.',
		explanation: 'Long polling gives near real-time updates over plain HTTP, without new infrastructure.',
		readMore: networking('pushing-new-messages', 'Pushing new messages'),
	},
	{
		id: 'sse',
		term: 'SSE',
		expansion: 'Server-Sent Events',
		short: 'A long HTTP response through which the server streams text events to the client.',
		explanation:
			'Browsers reconnect by themselves and send the ID of the last event, if the server sets IDs. SSE sends data only from server to client.',
		readMore: networking('pushing-new-messages', 'Pushing new messages'),
	},
	{
		id: 'websocket',
		term: 'WebSocket',
		aliases: ['WebSockets', 'WebSocket'],
		short: 'A long-lived connection where client and server can both send messages at any time.',
		explanation:
			'It starts as an HTTP request and then upgrades to a two-way channel on the same TCP connection. Used for chat, collaboration, and games.',
		readMore: networking('pushing-new-messages', 'Pushing new messages'),
	},
	{
		id: 'webrtc',
		term: 'WebRTC',
		expansion: 'Web Real-Time Communication',
		short: 'A technology for direct peer-to-peer audio, video, and data in browsers and mobile apps.',
		explanation:
			'Peers connect to each other over UDP when they can. A signaling server, STUN, and TURN help them find each other through NAT.',
		readMore: networking('pushing-new-messages', 'Pushing new messages'),
	},
	{
		id: 'turn',
		term: 'TURN',
		expansion: 'Traversal Using Relays around NAT',
		short: 'A relay server that forwards traffic between peers when they cannot connect directly.',
		explanation: 'TURN relays media when a direct connection is not possible. All media then goes through the relay, so it needs enough bandwidth.',
		readMore: networking('pushing-new-messages', 'Pushing new messages'),
	},
	{
		id: 'signaling',
		term: 'Signaling',
		short: 'Exchanging connection details between two peers before they connect directly.',
		explanation:
			'WebRTC does not define how signaling works. Apps usually send it through a server they already have, for example over WebSocket.',
		readMore: networking('pushing-new-messages', 'Pushing new messages'),
	},
	{
		id: 'load-balancer',
		term: 'Load balancer',
		aliases: ['load balancer', 'load balancers'],
		short: 'A component that spreads incoming traffic across several servers.',
		explanation: 'It also stops sending traffic to servers that fail health checks, so clients see one stable address.',
		readMore: networking('adding-servers', 'Adding servers'),
	},
	{
		id: 'l4-l7',
		term: 'L4 / L7',
		aliases: ['L4', 'L7'],
		short: 'Network layers: L4 is the transport layer (TCP, UDP), L7 is the application layer (HTTP).',
		explanation: 'An L4 load balancer routes connections. An L7 load balancer reads each HTTP request and can route by path or header.',
		readMore: networking('adding-servers', 'Adding servers'),
	},
	{
		id: 'round-robin',
		term: 'Round robin',
		aliases: ['round robin', 'Round robin'],
		short: 'Sending each new request to the next server in turn.',
		explanation: 'Round robin is simple and works well when requests cost about the same.',
		readMore: networking('spreading-the-load', 'Spreading the load'),
	},
	{
		id: 'weighted-round-robin',
		term: 'Weighted round robin',
		aliases: ['weighted round robin', 'Weighted round robin'],
		short: 'Round robin that sends more requests to servers with a higher weight.',
		explanation: 'Weights follow server capacity, so a server twice as big gets twice the traffic.',
		readMore: networking('spreading-the-load', 'Spreading the load'),
	},
	{
		id: 'least-connections',
		term: 'Least connections',
		aliases: ['least connections', 'Least connections'],
		short: 'Sending each new connection to the server with the fewest open connections.',
		explanation: 'Good for long-lived connections, where the number of open connections shows the load better than the number of requests.',
		readMore: networking('spreading-the-load', 'Spreading the load'),
	},
	{
		id: 'health-check',
		term: 'Health check',
		aliases: ['health check', 'health checks', 'Health checks'],
		short: 'A regular probe that tells whether a server can take traffic.',
		explanation: 'Load balancers remove servers that fail several checks in a row and add them back after several successes.',
		readMore: networking('adding-servers', 'Adding servers'),
	},
	{
		id: 'single-point-of-failure',
		term: 'Single point of failure',
		aliases: ['single point of failure', 'Single point of failure'],
		short: 'A part whose failure stops the whole system.',
		explanation: 'Remove it by running more than one copy and switching to a healthy one automatically.',
		readMore: { href: 'https://en.wikipedia.org/wiki/Single_point_of_failure', label: 'Wikipedia: Single point of failure' },
	},
	{
		id: 'sticky-sessions',
		term: 'Sticky sessions',
		aliases: ['sticky sessions', 'Sticky sessions'],
		short: 'Sending all requests from one client to the same server.',
		explanation: 'It keeps server-local state usable, but makes failover and rebalancing harder.',
		readMore: networking('servers-with-state', 'Servers with state'),
	},
	{
		id: 'stateless',
		term: 'Stateless',
		aliases: ['stateless', 'Stateless'],
		short: 'Keeping no user data on the server between requests.',
		explanation:
			'Each request carries what the server needs, and user data lives in a shared store. Any server can then handle any request, which makes scaling and failures simpler.',
		readMore: networking('servers-with-state', 'Servers with state'),
	},
	{
		id: 'service-discovery',
		term: 'Service discovery',
		short: 'A way for services to find the current addresses of other services.',
		explanation: 'Instances register themselves, and clients ask the registry for healthy instances. A load balancer or the client itself uses it to pick a live instance.',
		readMore: networking('finding-the-server', 'Finding the server'),
	},
	{
		id: 'cdn',
		term: 'CDN',
		expansion: 'Content Delivery Network',
		short: 'A network of servers around the world that cache content close to users.',
		explanation: 'A CDN cuts latency for users and load on your servers. It suits static files and responses that many users read.',
		readMore: networking('users-far-away', 'Users far away'),
	},
	{
		id: 'geodns',
		term: 'GeoDNS',
		short: 'DNS that answers with different addresses depending on where the client is.',
		explanation:
			'It picks a region from an estimate of where the user is. Cached answers delay a change until they expire, and open connections must reconnect.',
		readMore: networking('users-far-away', 'Users far away'),
	},
	{
		id: 'consistency',
		term: 'Consistency',
		aliases: ['consistency', 'Consistency'],
		short: 'The rules for which version of data a read may return.',
		explanation:
			'Stronger guarantees need more coordination between copies. Weaker ones allow older data and need less coordination.',
		readMore: consistency('acting-as-one-copy', 'Acting as one copy'),
		explainedIn: ['fundamentals/transactions', 'fundamentals/replication'],
	},
	{
		id: 'deadline',
		term: 'Deadline',
		aliases: ['deadline', 'deadlines'],
		short: 'The latest time by which a whole request must finish.',
		explanation: 'Each service passes the remaining time to the services it calls, so they can stop work that is no longer needed.',
		readMore: networking('when-a-call-fails', 'When a call fails'),
		explainedIn: ['patterns/reservations'],
	},
	{
		id: 'exponential-backoff',
		term: 'Exponential backoff',
		short: 'Waiting longer after each failed try, for example 100 ms, 200 ms, 400 ms.',
		explanation: 'It gives a struggling service time to recover. Combine it with jitter and a cap on tries.',
		readMore: networking('when-a-call-fails', 'When a call fails'),
	},
	{
		id: 'jitter',
		term: 'Jitter',
		short: 'A random extra wait added before a retry.',
		explanation: 'Without jitter, many clients retry at the same moment and overload the service again.',
		readMore: networking('when-a-call-fails', 'When a call fails'),
	},
	{
		id: 'circuit-breaker',
		term: 'Circuit breaker',
		aliases: ['circuit breaker', 'Circuit breaker'],
		short: 'A guard that stops calls to a failing dependency for a while and fails fast instead.',
		explanation: 'It has three states: closed (calls pass), open (calls fail fast), and half-open (a few test calls). It keeps one failure from spreading.',
		readMore: networking('when-a-call-fails', 'When a call fails'),
	},
	{
		id: 'storage-engine',
		term: 'Storage engine',
		aliases: ['storage engine', 'storage engines', 'Storage engine', 'Storage engines'],
		short: 'The part of a database that stores records on disk or in memory and finds them again.',
		explanation:
			'It decides which reads and writes are cheap. Most engines are built on a B-tree or an LSM-tree, and the choice follows the workload.',
		readMore: { href: 'fundamentals/storage-engines/', label: 'Storage engines' },
	},
	{
		id: 'append-only-log',
		term: 'Append-only log',
		aliases: ['append-only log', 'append-only logs', 'Append-only log', 'append-only file', 'append-only files', 'Append-only file'],
		short: 'A file of records that only grows at the end; old records are never changed.',
		explanation:
			'Appending is the cheapest write, and a newer record for a key replaces the older one. Many databases keep a log inside, for recovery or as their main storage.',
		readMore: storageEngines('from-memory-to-disk', 'From memory to disk'),
	},
	{
		id: 'index',
		term: 'Index',
		aliases: ['index', 'indexes', 'Index', 'Indexes'],
		short: 'Extra data, built from the records, that finds a record without a full scan.',
		explanation:
			'An index speeds up reads, but it takes space and every write must update it too. So a database indexes only what its queries need.',
		readMore: storageEngines('finding-a-record-fast', 'Finding a record fast'),
	},
	{
		id: 'hash-index',
		term: 'Hash index',
		aliases: ['hash index', 'hash indexes', 'Hash index'],
		short: 'An index that maps each key to the place of its record through a hash map.',
		explanation:
			'It answers lookups by exact key in one step, but it keeps no order, so it cannot return a range of keys. An in-memory hash index needs all keys to fit in RAM.',
		readMore: storageEngines('finding-a-record-fast', 'Finding a record fast'),
	},
	{
		id: 'compaction',
		term: 'Compaction',
		aliases: ['compaction', 'Compaction'],
		short: 'Background work that merges data files and keeps only the latest record for each key.',
		explanation:
			'It frees the space taken by old and deleted records. It also competes with requests for the disk, and when writes outrun it, files pile up.',
		readMore: storageEngines('reclaiming-space', 'Reclaiming space'),
	},
	{
		id: 'tombstone',
		term: 'Tombstone',
		aliases: ['tombstone', 'tombstones', 'Tombstone'],
		short: 'A record that marks a key as deleted.',
		explanation:
			'Files that are only appended to cannot erase a record, so a delete writes a tombstone. It must stay until no older file can bring the deleted value back, and until compaction removes the key, the deleted data is still on disk.',
		readMore: storageEngines('reclaiming-space', 'Reclaiming space'),
	},
	{
		id: 'checksum',
		term: 'Checksum',
		aliases: ['checksum', 'checksums', 'Checksum'],
		short: 'A small value computed from data to detect whether the data has changed.',
		explanation:
			'The writer stores it next to the data, and the reader computes it again. A mismatch means the data is incomplete or damaged.',
		readMore: { href: 'https://en.wikipedia.org/wiki/Checksum', label: 'Wikipedia: Checksum' },
		explainedIn: ['technologies/postgresql'],
	},
	{
		id: 'page-cache',
		term: 'Page cache',
		aliases: ['page cache', 'Page cache'],
		short: 'Memory where the operating system keeps recently read and written parts of files.',
		explanation:
			'Reads of hot data skip the disk. Written data waits there before it reaches the disk, so a power loss can erase it until a flush.',
		readMore: storageEngines('surviving-a-crash', 'Surviving a crash'),
	},
	{
		id: 'durability',
		term: 'Durability',
		aliases: ['durability', 'Durability', 'durable'],
		short: 'The promise that a confirmed write survives a crash or a power loss.',
		explanation:
			'A write is durable only after a flush, such as fsync, puts it on disk. The store chooses whether to confirm a write before or after that flush.',
		readMore: storageEngines('surviving-a-crash', 'Surviving a crash'),
		explainedIn: ['fundamentals/transactions'],
	},
	{
		id: 'group-commit',
		term: 'Group commit',
		aliases: ['group commit', 'Group commit'],
		short: 'Making several writes durable with one shared flush.',
		explanation:
			'The store collects the writes that arrive within a few milliseconds and flushes them together. It can then wait for the disk before saying "ok" without paying a flush for each write.',
		readMore: storageEngines('surviving-a-crash', 'Surviving a crash'),
	},
	{
		id: 'snapshot',
		term: 'Snapshot',
		aliases: ['snapshot', 'snapshots', 'Snapshot'],
		short: 'The state of data at one moment.',
		explanation:
			'An in-memory store saves one to disk for recovery and replays the log written after it. A transaction can read from one, so data does not change under it.',
		readMore: storageEngines('back-to-memory', 'Back to memory'),
		explainedIn: ['fundamentals/transactions'],
	},
	{
		id: 'sstable',
		term: 'SSTable',
		aliases: ['SSTable', 'SSTables', 'sorted string table'],
		expansion: 'Sorted String Table',
		short: 'A data file whose records are sorted by key and never change after it is written.',
		explanation:
			'The order allows a sparse index, range reads, and cheap merges. LSM-trees store their data in SSTables.',
		readMore: storageEngines('keeping-records-sorted', 'Keeping records sorted'),
	},
	{
		id: 'sparse-index',
		term: 'Sparse index',
		aliases: ['sparse index', 'sparse indexes', 'Sparse index'],
		short: 'An index that keeps one key per block of sorted records instead of one key per record.',
		explanation:
			'A read finds the right block and scans it. The index is much smaller, so it fits in memory for far more data.',
		readMore: storageEngines('keeping-records-sorted', 'Keeping records sorted'),
	},
	{
		id: 'memtable',
		term: 'Memtable',
		aliases: ['memtable', 'memtables', 'Memtable'],
		short: 'A sorted structure in memory that collects new writes before they go to disk.',
		explanation:
			'When it is full, it is written out as a new SSTable in one sequential write. A WAL protects it from a crash.',
		readMore: storageEngines('sorting-writes-in-memory', 'Sorting writes in memory'),
	},
	{
		id: 'wal',
		term: 'WAL',
		aliases: ['WAL', 'write-ahead log', 'Write-ahead log'],
		expansion: 'Write-ahead log',
		short: 'A log on disk where changes are written before the data files they change.',
		explanation:
			'After a crash, the database replays it to rebuild the memtable of an LSM-tree or to repair half-written pages of a B-tree. A write is confirmed once its log record is flushed.',
		readMore: storageEngines('sorting-writes-in-memory', 'Sorting writes in memory'),
	},
	{
		id: 'lsm-tree',
		term: 'LSM-tree',
		aliases: ['LSM-tree', 'LSM-trees', 'LSM tree', 'LSM trees', 'log-structured merge-tree'],
		expansion: 'Log-structured merge-tree',
		short: 'A storage engine that collects writes in memory and writes them out as sorted files merged in the background.',
		explanation:
			'The log is appended in order, and sorted files are written and merged in order, so writes tend to be fast. Reads may check several files, and compaction can fall behind under heavy writes.',
		readMore: storageEngines('sorting-writes-in-memory', 'Sorting writes in memory'),
	},
	{
		id: 'bloom-filter',
		term: 'Bloom filter',
		aliases: ['Bloom filter', 'Bloom filters', 'bloom filter', 'bloom filters'],
		short: 'A small bit array that says whether a key is definitely absent or maybe present.',
		explanation:
			'It never misses a key that is there, but it sometimes says "maybe" for a key that is not. A lookup by key uses it to skip files that cannot hold the key; range reads get no help.',
		readMore: storageEngines('keeping-reads-cheap', 'Keeping reads cheap'),
	},
	{
		id: 'false-positive',
		term: 'False positive',
		aliases: ['false positive', 'false positives', 'False positive'],
		short: 'A check that says "yes" or "maybe" when the true answer is "no".',
		explanation:
			'A Bloom filter can give false positives but never false negatives. A false positive costs extra work, such as opening a file for nothing, but never a wrong answer.',
		readMore: storageEngines('keeping-reads-cheap', 'Keeping reads cheap'),
	},
	{
		id: 'size-tiered-compaction',
		term: 'Size-tiered compaction',
		aliases: ['size-tiered compaction', 'Size-tiered compaction'],
		short: 'A compaction strategy that merges files of similar size.',
		explanation: 'It rewrites data fewer times than leveled compaction, so writes are cheaper. Reads check more files, and merges need more spare disk space.',
		readMore: storageEngines('keeping-reads-cheap', 'Keeping reads cheap'),
	},
	{
		id: 'leveled-compaction',
		term: 'Leveled compaction',
		aliases: ['leveled compaction', 'Leveled compaction'],
		short: 'A compaction strategy that keeps files in levels where, apart from newly flushed files, the files of one level do not overlap in keys.',
		explanation:
			'A lookup by key checks the newly flushed files and at most one file in each other level. Data takes less space than with size-tiered compaction, but it is rewritten more often.',
		readMore: storageEngines('keeping-reads-cheap', 'Keeping reads cheap'),
	},
	{
		id: 'b-tree',
		term: 'B-tree',
		aliases: ['B-tree', 'B-trees', 'B+tree', 'B+trees'],
		short: 'A storage structure that keeps sorted keys in a tree of fixed-size pages and changes them in place.',
		explanation:
			'A lookup follows one page per level, and the upper levels stay in memory. Leaves in key order serve ranges. It is the default index of most relational databases.',
		readMore: storageEngines('updating-in-place', 'Updating in place'),
	},
	{
		id: 'amplification',
		term: 'Amplification',
		aliases: [
			'amplification',
			'Read amplification',
			'Write amplification',
			'Space amplification',
			'read amplification',
			'write amplification',
			'space amplification',
		],
		short: 'How much more the disk reads, writes, or stores than the data the app asked for.',
		explanation: 'Read, write, and space amplification measure different costs. Compare storage engines on the same workload, since the numbers depend on it.',
		readMore: storageEngines('choosing-an-engine', 'Choosing an engine'),
	},
	{
		id: 'primary-key',
		term: 'Primary key',
		aliases: ['primary key', 'primary keys', 'Primary key'],
		short: 'The column or columns that identify each record of a table.',
		explanation: 'No two records share it. The database keeps an index on it to find records by it.',
		readMore: { href: 'https://en.wikipedia.org/wiki/Primary_key', label: 'Wikipedia: Primary key' },
	},
	{
		id: 'secondary-index',
		term: 'Secondary index',
		aliases: ['secondary index', 'secondary indexes', 'Secondary index'],
		short: 'An additional index that finds records by columns other than the primary key.',
		explanation:
			'Values need not be unique, so each entry also identifies its record: by its place in the table or by its primary key. Every write that changes the indexed columns must update it.',
		readMore: storageEngines('searching-by-other-columns', 'Searching by other columns'),
	},
	{
		id: 'composite-index',
		term: 'Composite index',
		aliases: ['composite index', 'composite indexes', 'Composite index'],
		short: 'An index on several columns, sorted by the first column, then by the next.',
		explanation:
			'Put the columns compared with = first and the sort or range column last. It usually cannot help a query that uses only a later column.',
		readMore: storageEngines('searching-by-other-columns', 'Searching by other columns'),
	},
	{
		id: 'covering-index',
		term: 'Covering index',
		aliases: ['covering index', 'covering indexes', 'Covering index'],
		short: 'An index that holds every column a query needs.',
		explanation: 'The database can answer the query from the index without reading the records. The price is a bigger index.',
		readMore: storageEngines('searching-by-other-columns', 'Searching by other columns'),
	},
	{
		id: 'query-plan',
		term: 'Query plan',
		aliases: ['query plan', 'query plans', 'Query plan'],
		short: 'The steps a database chooses to run a query, such as which index to use.',
		explanation: 'Databases show it on request (EXPLAIN in SQL). Check it to see whether a query really uses the index you added.',
		readMore: postgresql('finding-why-a-query-is-slow', 'Finding why a query is slow'),
	},
	{
		id: 'row-storage',
		term: 'Row storage',
		aliases: ['row storage', 'Row storage'],
		short: 'Keeping all values of a record together in one place.',
		explanation: 'It suits apps that read and write a few whole records at a time. A query that needs a few columns of many records still reads whole rows.',
		readMore: storageEngines('scanning-for-analytics', 'Scanning for analytics'),
	},
	{
		id: 'column-storage',
		term: 'Column storage',
		aliases: ['column storage', 'Column storage', 'column store', 'column stores', 'Column store'],
		short: 'Keeping the values of each column together instead of each record together.',
		explanation:
			'A query reads only the columns it needs, and columns often compress well. New rows are collected in memory and written to the columns in batches, so work on single records is less efficient.',
		readMore: storageEngines('scanning-for-analytics', 'Scanning for analytics'),
	},
	{
		id: 'oltp',
		term: 'OLTP',
		aliases: ['OLTP', 'online transaction processing'],
		expansion: 'Online transaction processing',
		short: 'The workload of an app: many small reads and writes of single records by key.',
		explanation: 'It needs fast lookups and steady latency. Row storage usually suits it.',
		readMore: storageEngines('scanning-for-analytics', 'Scanning for analytics'),
	},
	{
		id: 'olap',
		term: 'OLAP',
		aliases: ['OLAP', 'online analytical processing'],
		expansion: 'Online analytical processing',
		short: 'The workload of analytics: large scans and totals over many records.',
		explanation: 'It often reads few columns of many records, which suits column storage. Analytics usually runs in a separate store loaded from the main one.',
		readMore: storageEngines('scanning-for-analytics', 'Scanning for analytics'),
	},
	{
		id: 'relational-model',
		term: 'Relational model',
		aliases: ['relational model', 'Relational model', 'relational store', 'relational stores'],
		short: 'A data model that keeps data in tables of rows linked by keys.',
		explanation:
			'Queries combine tables with joins, and the database enforces rules with constraints. It is the default for data with many relations and rules.',
		readMore: databases('storing-each-fact-once', 'Storing each fact once'),
	},
	{
		id: 'foreign-key',
		term: 'Foreign key',
		aliases: ['foreign key', 'foreign keys', 'Foreign key'],
		short: 'A column or group of columns whose values point to a unique key of a row, usually in another table.',
		explanation:
			'It links the two rows. The database can reject a value that points to no row and remove dependent rows on delete.',
		readMore: databases('storing-each-fact-once', 'Storing each fact once'),
	},
	{
		id: 'join',
		term: 'Join',
		aliases: ['join', 'joins', 'Join'],
		short: 'A query operation that combines rows of tables by a matching condition, usually on keys.',
		explanation:
			'It turns stored IDs back into the data they point to, such as an author\'s name for a post. Every join is work on each read.',
		readMore: databases('storing-each-fact-once', 'Storing each fact once'),
	},
	{
		id: 'normalization',
		term: 'Normalization',
		aliases: ['normalization', 'Normalization', 'normalized'],
		short: 'Storing each fact once and referring to it by key everywhere else.',
		explanation:
			'An update changes one place, so copies cannot disagree. The price is joins on reads.',
		readMore: databases('storing-each-fact-once', 'Storing each fact once'),
	},
	{
		id: 'constraint',
		term: 'Constraint',
		aliases: ['constraint', 'constraints', 'Constraint', 'Constraints'],
		short: 'A rule that the database checks on every write, such as a unique key or a foreign key.',
		explanation:
			'The database rejects a write that breaks the rule, so a bug in one service cannot break it.',
		readMore: databases('storing-each-fact-once', 'Storing each fact once'),
	},
	{
		id: 'transaction',
		term: 'Transaction',
		aliases: ['transaction', 'transactions', 'Transaction'],
		short: 'A group of reads and writes that the database applies as one unit.',
		explanation:
			'Either all of its changes happen or none do, and concurrent transactions do not see each other\'s half-done work.',
		readMore: transactions('changing-several-rows-at-once', 'Changing several rows at once'),
	},
	{
		id: 'commit',
		term: 'Commit',
		aliases: ['commit', 'commits', 'Commit', 'committed'],
		short: 'The end of a transaction that makes all of its changes permanent at once.',
		explanation:
			'Other transactions see the changes only after the commit. A committed change is final: undoing it takes a new transaction that does the opposite.',
		readMore: transactions('changing-several-rows-at-once', 'Changing several rows at once'),
	},
	{
		id: 'rollback',
		term: 'Rollback',
		aliases: ['rollback', 'rollbacks', 'Rollback', 'roll back', 'rolls back', 'rolled back'],
		short: 'The end of a transaction that discards all of its changes.',
		explanation:
			'The app rolls back when a check fails, and after a crash the database rolls back every transaction that did not commit.',
		readMore: transactions('changing-several-rows-at-once', 'Changing several rows at once'),
	},
	{
		id: 'atomicity',
		term: 'Atomicity',
		aliases: ['atomicity', 'Atomicity', 'atomic', 'Atomic'],
		short: 'The rule that a set of changes is applied fully or not at all.',
		explanation:
			'A failure in the middle never leaves part of the changes behind. A transaction gives it to several rows, and most stores give it to a single record.',
		readMore: transactions('changing-several-rows-at-once', 'Changing several rows at once'),
	},
	{
		id: 'autocommit',
		term: 'Autocommit',
		aliases: ['autocommit', 'Autocommit'],
		short: 'A mode in which each statement is a transaction of its own and commits when it ends.',
		explanation:
			'It is the default in most databases and drivers. Statements that must succeed together need an explicit transaction.',
		readMore: transactions('changing-several-rows-at-once', 'Changing several rows at once'),
	},
	{
		id: 'commit-record',
		term: 'Commit record',
		aliases: ['commit record', 'commit records', 'Commit record'],
		short: 'The entry in the write-ahead log that marks a transaction as committed.',
		explanation:
			'The transaction is committed once this entry is on disk. After a crash, the database keeps transactions that have one and removes the rest.',
		readMore: transactions('undoing-a-half-done-transaction', 'Undoing a half-done transaction'),
	},
	{
		id: 'checkpoint',
		term: 'Checkpoint',
		aliases: ['checkpoint', 'checkpoints', 'Checkpoint'],
		short: 'A mark in the log from which recovery after a crash can start.',
		explanation:
			'The database writes changed pages to disk from time to time and records a checkpoint, so recovery does not replay the log from the beginning.',
		readMore: transactions('undoing-a-half-done-transaction', 'Undoing a half-done transaction'),
	},
	{
		id: 'undo-log',
		term: 'Undo log',
		aliases: ['undo log', 'undo logs', 'Undo log'],
		short: 'A separate area that keeps the old values of rows changed in place.',
		explanation:
			'A rollback copies the old values back, and readers that need an older version rebuild it from there.',
		readMore: transactions('undoing-a-half-done-transaction', 'Undoing a half-done transaction'),
	},
	{
		id: 'row-version',
		term: 'Row version',
		aliases: ['row version', 'row versions', 'Row version', 'Row versions'],
		short: 'One state of a row, kept so that each transaction can read the state it should see.',
		explanation:
			'Versions are kept as separate copies of the row or rebuilt from an undo log. Readers pick the version they should see, and old versions are cleaned up later.',
		readMore: transactions('undoing-a-half-done-transaction', 'Undoing a half-done transaction'),
	},
	{
		id: 'lost-update',
		term: 'Lost update',
		aliases: ['lost update', 'lost updates', 'Lost update', 'Lost updates'],
		short: 'A write that overwrites another write that it never saw.',
		explanation:
			'Two transactions read a value, change it, and write it back; one change disappears. An atomic update or compare-and-set prevents it.',
		readMore: transactions('two-writers-on-one-value', 'Two writers on one value'),
	},
	{
		id: 'atomic-update',
		term: 'Atomic update',
		aliases: ['atomic update', 'atomic updates', 'Atomic update'],
		short: 'A single statement that computes a new value from the current one, such as subtracting from a counter.',
		explanation:
			'The database reads and changes the row in one step, so no other write can land in between. A condition in the statement can keep a rule, such as "never below zero".',
		readMore: transactions('two-writers-on-one-value', 'Two writers on one value'),
	},
	{
		id: 'compare-and-set',
		term: 'Compare-and-set',
		aliases: ['compare-and-set', 'Compare-and-set', 'CAS'],
		short: 'A write that succeeds only if the value is still the one the writer read.',
		explanation:
			'If another writer changed it first, the write does nothing, and the writer reads again and retries.',
		readMore: transactions('two-writers-on-one-value', 'Two writers on one value'),
	},
	{
		id: 'dirty-read',
		term: 'Dirty read',
		aliases: ['dirty read', 'dirty reads', 'Dirty read'],
		short: 'A read that sees changes another transaction has not committed yet.',
		explanation:
			'If that transaction rolls back, the reader acted on data that never existed. Read committed and stronger levels prevent it.',
		readMore: transactions('seeing-unfinished-changes', 'Seeing unfinished changes'),
	},
	{
		id: 'dirty-write',
		term: 'Dirty write',
		aliases: ['dirty write', 'dirty writes', 'Dirty write'],
		short: 'A write that overwrites a change another transaction has not committed yet.',
		explanation:
			'Interleaved writes can leave rows that belong to different transactions. Every isolation level prevents it.',
		readMore: transactions('seeing-unfinished-changes', 'Seeing unfinished changes'),
	},
	{
		id: 'isolation',
		term: 'Isolation',
		aliases: ['isolation', 'Isolation', 'isolation level', 'isolation levels', 'Isolation level'],
		short: 'How much concurrent transactions are kept from seeing or overwriting each other\'s work.',
		explanation:
			'Each level, from read committed to serializable, blocks a different set of anomalies. Stronger levels cost waits or retries.',
		readMore: transactions('seeing-unfinished-changes', 'Seeing unfinished changes'),
	},
	{
		id: 'read-committed',
		term: 'Read committed',
		aliases: ['read committed', 'Read committed'],
		short: 'The isolation level at which each statement sees only committed data.',
		explanation:
			'It prevents dirty reads and dirty writes, and it is the default in most databases. Data can still change between two statements of one transaction.',
		readMore: transactions('seeing-unfinished-changes', 'Seeing unfinished changes'),
	},
	{
		id: 'read-uncommitted',
		term: 'Read uncommitted',
		aliases: ['read uncommitted', 'Read uncommitted'],
		short: 'The lowest isolation level, which lets a transaction see uncommitted changes.',
		explanation: 'It allows dirty reads and is rarely useful.',
		readMore: transactions('seeing-unfinished-changes', 'Seeing unfinished changes'),
	},
	{
		id: 'lock',
		term: 'Lock',
		aliases: ['lock', 'locks', 'Lock', 'Locks', 'row lock', 'row locks', 'Row locks'],
		short: 'A mark that reserves a row or a range of rows for one transaction and makes conflicting transactions wait.',
		explanation:
			'A write takes an exclusive lock on its row until the transaction ends, and readers can share a shared lock. Locks prevent conflicting writes but cause waits and deadlocks.',
		readMore: transactions('seeing-unfinished-changes', 'Seeing unfinished changes'),
		explainedIn: ['technologies/redis'],
	},
	{
		id: 'read-skew',
		term: 'Read skew',
		aliases: ['read skew', 'Read skew', 'non-repeatable read', 'non-repeatable reads', 'Non-repeatable read'],
		short: 'Reads in one transaction that see the data at different moments, so their results disagree.',
		explanation:
			'Reading the same row twice and getting two values is its simplest form, a non-repeatable read. Snapshot isolation prevents it.',
		readMore: transactions('reading-a-consistent-picture', 'Reading a consistent picture'),
	},
	{
		id: 'snapshot-isolation',
		term: 'Snapshot isolation',
		aliases: ['snapshot isolation', 'Snapshot isolation'],
		short: 'An isolation level at which a transaction reads the data as it was when the transaction started.',
		explanation:
			'Later commits are invisible to it, so all its reads agree. It prevents read skew and lost updates, but not write skew.',
		readMore: transactions('reading-a-consistent-picture', 'Reading a consistent picture'),
	},
	{
		id: 'mvcc',
		term: 'MVCC',
		aliases: ['MVCC'],
		expansion: 'Multi-version concurrency control',
		short: 'Keeping several versions of a row so that each transaction reads the one it should see.',
		explanation:
			'Plain reads do not block writers, and writers do not block plain reads. Old versions stay until no transaction needs them, so long transactions make data grow.',
		readMore: transactions('reading-a-consistent-picture', 'Reading a consistent picture'),
	},
	{
		id: 'shared-lock',
		term: 'Shared lock',
		aliases: ['shared lock', 'shared locks', 'Shared lock', 'Shared locks'],
		short: 'A lock that many readers can hold at once, but that makes a writer wait.',
		explanation:
			'A reader that keeps it until commit sees the same rows on every read. Readers and writers then block each other.',
		readMore: transactions('reading-a-consistent-picture', 'Reading a consistent picture'),
	},
	{
		id: 'repeatable-read',
		term: 'Repeatable read',
		aliases: ['repeatable read', 'Repeatable read'],
		short: 'The isolation level of the SQL standard that rules out non-repeatable reads.',
		explanation:
			'Databases with row versions usually provide it as snapshot isolation, others with shared locks. What it allows differs between products.',
		readMore: transactions('reading-a-consistent-picture', 'Reading a consistent picture'),
	},
	{
		id: 'pessimistic-locking',
		term: 'Pessimistic locking',
		aliases: ['pessimistic locking', 'Pessimistic locking'],
		short: 'Locking rows when they are read, so that no other transaction can change them before the write.',
		explanation:
			'Conflicting transactions wait instead of failing. It suits rows that many transactions want at once.',
		readMore: transactions('checking-then-writing', 'Checking, then writing'),
	},
	{
		id: 'optimistic-locking',
		term: 'Optimistic locking',
		aliases: ['optimistic locking', 'Optimistic locking'],
		short: 'Checking at write time that a row has not changed since it was read, usually by a version number.',
		explanation:
			'No lock is held between the read and the write. On a conflict the work is retried, so it suits rows that rarely conflict.',
		readMore: transactions('checking-then-writing', 'Checking, then writing'),
	},
	{
		id: 'serialization-error',
		term: 'Serialization error',
		aliases: ['serialization error', 'serialization errors', 'Serialization error', 'serialization failure', 'serialization failures'],
		short: 'An error by which the database aborts a transaction that conflicts with a concurrent one.',
		explanation: 'The app must run the whole transaction again from the start.',
		readMore: transactions('checking-then-writing', 'Checking, then writing'),
	},
	{
		id: 'deadlock',
		term: 'Deadlock',
		aliases: ['deadlock', 'deadlocks', 'Deadlock', 'Deadlocks'],
		short: 'Two or more transactions that each wait for a lock another one holds, so none can go on.',
		explanation:
			'The database detects the cycle and aborts one transaction, which the app rolls back and retries. Taking locks in one fixed order prevents it.',
		readMore: transactions('waiting-for-each-other', 'Waiting for each other'),
	},
	{
		id: 'lock-timeout',
		term: 'Lock timeout',
		aliases: ['lock timeout', 'lock timeouts', 'Lock timeout'],
		short: 'The longest time a transaction waits for a lock before it fails.',
		explanation:
			'Too short aborts transactions that were only slow; too long keeps users waiting.',
		readMore: transactions('waiting-for-each-other', 'Waiting for each other'),
	},
	{
		id: 'write-skew',
		term: 'Write skew',
		aliases: ['write skew', 'Write skew'],
		short: 'Two transactions that read the same data and write different rows, together breaking a rule that each one kept.',
		explanation:
			'No two writes touch the same row, so row locks and snapshot isolation miss it. A shared row that both write, a unique constraint, or serializable isolation stops it.',
		readMore: transactions('a-rule-across-several-rows', 'A rule across several rows'),
	},
	{
		id: 'phantom',
		term: 'Phantom',
		aliases: ['phantom', 'phantoms', 'Phantom', 'Phantoms'],
		short: 'A write by one transaction that changes which rows match another transaction\'s search.',
		explanation:
			'The rows that match now did not match when the search ran, so there was nothing to lock. Range locks, a shared row that both write, or serializable isolation prevent the damage.',
		readMore: transactions('a-rule-across-several-rows', 'A rule across several rows'),
	},
	{
		id: 'materializing-the-conflict',
		term: 'Materializing the conflict',
		aliases: ['materializing the conflict', 'materialized conflict', 'Materializing the conflict'],
		short: 'Turning a rule across many rows into one row that every transaction affected by the rule must write.',
		explanation:
			'The conflict becomes an ordinary conflict on one row, which locks or snapshot isolation already catch. A counter per buyer is an example.',
		readMore: transactions('a-rule-across-several-rows', 'A rule across several rows'),
	},
	{
		id: 'serializable',
		term: 'Serializable',
		aliases: ['serializable', 'Serializable', 'serializable isolation', 'Serializable isolation'],
		short: 'The isolation level at which concurrent transactions end as if they had run one after another.',
		explanation:
			'It rules out every anomaly, at the cost of waits or retries. It covers only transactions that run at this level.',
		readMore: transactions('running-as-if-one-at-a-time', 'Running as if one at a time'),
	},
	{
		id: 'serial-execution',
		term: 'Serial execution',
		aliases: ['serial execution', 'Serial execution'],
		short: 'Running transactions one after another on one thread, so they never overlap.',
		explanation:
			'It gives serializable isolation without locks and works best with short transactions on data in memory. One thread caps throughput.',
		readMore: transactions('running-as-if-one-at-a-time', 'Running as if one at a time'),
	},
	{
		id: '2pl',
		term: '2PL',
		aliases: ['2PL', 'two-phase locking', 'Two-phase locking'],
		expansion: 'Two-phase locking',
		short: 'A way to get serializable isolation by holding read and write locks until the transaction ends.',
		explanation:
			'Queries also lock the ranges they searched, to stop phantoms. Readers and writers block each other, and deadlocks are common. Not to be confused with two-phase commit.',
		readMore: transactions('running-as-if-one-at-a-time', 'Running as if one at a time'),
	},
	{
		id: 'ssi',
		term: 'SSI',
		aliases: ['SSI', 'serializable snapshot isolation', 'Serializable snapshot isolation'],
		expansion: 'Serializable snapshot isolation',
		short: 'A way to get serializable isolation by reading from snapshots and aborting transactions whose reads and writes conflict.',
		explanation:
			'Reads never wait, but some transactions fail, including false alarms, and must be retried. Two writers of one row still wait as usual.',
		readMore: transactions('running-as-if-one-at-a-time', 'Running as if one at a time'),
	},
	{
		id: 'business-transaction',
		term: 'Business transaction',
		aliases: ['business transaction', 'business transactions', 'Business transaction'],
		short: 'A user\'s action that spans several requests and minutes, such as a checkout.',
		explanation:
			'Each step runs as a short database transaction. A claim that must last across the steps is stored in the data, not in an open transaction.',
		readMore: transactions('work-that-outlives-a-transaction', 'Work that outlives a transaction'),
	},
	{
		id: 'hold',
		term: 'Hold',
		aliases: ['hold with an expiry', 'holds with an expiry'],
		short: 'A claim on a resource, stored in its row as a state with an expiry time.',
		explanation:
			'Short transactions set and check it, and an expired hold counts as free. The final transaction checks the hold again.',
		readMore: transactions('work-that-outlives-a-transaction', 'Work that outlives a transaction'),
	},
	{
		id: 'hot-row',
		term: 'Hot row',
		aliases: ['hot row', 'hot rows', 'Hot row'],
		short: 'A row that many transactions write at once, so they wait for its lock one by one.',
		explanation:
			'Throughput drops to one transaction at a time. Splitting the row into many rows that writers take independently removes the queue.',
		readMore: transactions('contention-on-one-row', 'Contention on one row'),
	},
	{
		id: 'acid',
		term: 'ACID',
		aliases: ['ACID'],
		expansion: 'Atomicity, consistency, isolation, durability',
		short: 'The four guarantees of database transactions.',
		explanation:
			'Consistency here means the data follows its rules, unlike consistency between copies. The isolation is often weaker than serializable by default, so "ACID" does not say which anomalies remain.',
		readMore: transactions('stores-without-transactions-across-records', 'Stores without transactions across records'),
	},
	{
		id: 'base',
		term: 'BASE',
		aliases: ['BASE'],
		expansion: 'Basically available, soft state, eventually consistent',
		short: 'A loose label for stores that put availability and scale first and let copies disagree for a while.',
		explanation:
			'Many of them make only a write to one record atomic. It is not a precise guarantee, so check what the store actually provides.',
		readMore: transactions('stores-without-transactions-across-records', 'Stores without transactions across records'),
	},
	{
		id: 'sql',
		term: 'SQL',
		aliases: ['SQL'],
		expansion: 'Structured Query Language',
		short: 'The standard language for querying and changing data in relational databases.',
		explanation:
			'A query says what data it needs, and the database chooses how to get it, such as which indexes to use.',
		readMore: { href: 'https://en.wikipedia.org/wiki/SQL', label: 'Wikipedia: SQL' },
	},
	{
		id: 'denormalization',
		term: 'Denormalization',
		aliases: ['denormalization', 'Denormalization', 'denormalize', 'Denormalize'],
		short: 'Storing data a second time in the shape a read needs.',
		explanation:
			'A copied field, a counter, or a precomputed result makes a hot read cheap. Every write must also update the copy, and the copy can lag or disagree.',
		readMore: databases('copying-data-for-fast-reads', 'Copying data for fast reads'),
	},
	{
		id: 'json',
		term: 'JSON',
		aliases: ['JSON'],
		expansion: 'JavaScript Object Notation',
		short: 'A text format for nested data: objects with named fields, lists, strings, numbers, and booleans.',
		explanation:
			'Document stores keep records as JSON or a binary form of it, and relational databases have JSON columns.',
		readMore: { href: 'https://en.wikipedia.org/wiki/JSON', label: 'Wikipedia: JSON' },
	},
	{
		id: 'document-model',
		term: 'Document model',
		aliases: ['document model', 'Document model', 'document store', 'document stores'],
		short: 'A data model that keeps each record as one nested document, usually JSON.',
		explanation:
			'One request returns the whole tree. It fits records read whole and fits links between records poorly.',
		readMore: databases('loading-a-record-in-one-read', 'Loading a record in one read'),
	},
	{
		id: 'locality',
		term: 'Locality',
		aliases: ['locality', 'Locality'],
		short: 'Keeping data that is used together close together in storage.',
		explanation:
			'One request then returns all of it with fewer lookups. It helps only when the reader needs most of the stored data.',
		readMore: databases('loading-a-record-in-one-read', 'Loading a record in one read'),
	},
	{
		id: 'schema',
		term: 'Schema',
		aliases: ['schema', 'schemas', 'Schema'],
		short: 'The structure that records follow: their fields and the types of the fields.',
		explanation:
			'A relational table enforces its schema on every write. Without that check, the code that reads the data still relies on one.',
		readMore: databases('records-with-different-fields', 'Records with different fields'),
	},
	{
		id: 'schema-on-write',
		term: 'Schema-on-write / schema-on-read',
		aliases: ['schema-on-write', 'Schema-on-write', 'schema-on-read', 'Schema-on-read'],
		short: 'Two places to check the structure of records: when they are written, or when they are read.',
		explanation:
			'Schema-on-write rejects bad records but needs migrations to change. With schema-on-read the store does not check records on write, so readers must handle every shape ever written.',
		readMore: databases('records-with-different-fields', 'Records with different fields'),
	},
	{
		id: 'object-storage',
		term: 'Object storage',
		aliases: ['object storage', 'Object storage'],
		short: 'A store of files under keys in one flat namespace, read and written whole over HTTP.',
		explanation:
			'It is cheap, grows without limit, and keeps files durable. Amazon S3 is the best-known one.',
		readMore: databases('storing-files', 'Storing files'),
	},
	{
		id: 'pre-signed-url',
		term: 'Pre-signed URL',
		aliases: ['pre-signed URL', 'pre-signed URLs', 'Pre-signed URL'],
		short: 'A time-limited link that allows one kind of operation on one object, such as an upload to one key.',
		explanation:
			'The client sends or gets the file straight from object storage, bypassing the app servers. The link works until it expires, so it can be used more than once.',
		readMore: databases('storing-files', 'Storing files'),
	},
	{
		id: 'sla',
		term: 'SLA',
		aliases: ['SLA', 'SLAs'],
		expansion: 'Service-level agreement',
		short: 'A promise from a provider about a service level, such as monthly availability.',
		explanation:
			'Breaking it usually earns the customer a credit, not the lost time back.',
		readMore: { href: 'https://en.wikipedia.org/wiki/Service-level_agreement', label: 'Wikipedia: Service-level agreement' },
	},
	{
		id: 'key-value-model',
		term: 'Key-value model',
		aliases: ['key-value model', 'Key-value model', 'key-value store', 'key-value stores', 'Key-value store', 'Key-value stores'],
		short: 'A data model with three operations: get, put, and delete a value by its full key.',
		explanation:
			'The store does not look inside the value. In return, the data is easy to spread across machines.',
		readMore: databases('looking-up-by-key-only', 'Looking up by key only'),
	},
	{
		id: 'backfill',
		term: 'Backfill',
		aliases: ['backfill', 'backfills', 'Backfill'],
		short: 'A job that fills a new table or field from the data that already exists.',
		explanation:
			'It is needed when a new query gets its own table, and it can take hours on large data.',
		readMore: databases('designing-from-the-queries', 'Designing from the queries'),
	},
	{
		id: 'wide-column-model',
		term: 'Wide-column model',
		aliases: ['wide-column model', 'Wide-column model', 'wide-column store', 'wide-column stores'],
		short: 'A data model that groups rows into partitions by key and sorts the rows inside each partition.',
		explanation:
			'A query reads a range of rows from one partition. Stores of this kind spread partitions across many machines and suit heavy writes.',
		readMore: databases('keeping-related-rows-together-in-order', 'Keeping related rows together in order'),
	},
	{
		id: 'partition-key',
		term: 'Partition key',
		aliases: ['partition key', 'partition keys', 'Partition key'],
		short: 'The part of a key that decides which partition holds a record, and so which machines store it.',
		explanation:
			'A query that names it stays within one partition. Each partition must stay bounded in size.',
		readMore: databases('keeping-related-rows-together-in-order', 'Keeping related rows together in order'),
	},
	{
		id: 'clustering-key',
		term: 'Clustering key',
		aliases: ['clustering key', 'clustering keys', 'Clustering key', 'sort key', 'sort keys'],
		short: 'The part of a key that sorts records inside one partition.',
		explanation:
			'It makes range reads, such as the latest 50 messages, one read. It must be unique within the partition, or a write with the same key updates the existing record.',
		readMore: databases('keeping-related-rows-together-in-order', 'Keeping related rows together in order'),
	},
	{
		id: 'graph-model',
		term: 'Graph model',
		aliases: ['graph model', 'Graph model', 'graph database', 'graph databases'],
		short: 'A data model of vertices and the edges between them, both with properties.',
		explanation:
			'Queries follow edges, so paths of unknown length are easy to express. In SQL each step of a path is a join.',
		readMore: databases('following-links-many-steps-deep', 'Following links many steps deep'),
	},
	{
		id: 'time-series-store',
		term: 'Time-series store',
		aliases: ['time-series store', 'time-series stores', 'Time-series store', 'time-series database', 'time-series databases'],
		short: 'A store built for measurements over time, typically appended in time order and queried over recent windows.',
		explanation:
			'Many such stores keep data in time blocks, so old data is dropped cheaply, and some compute rollups for long history.',
		readMore: databases('measuring-over-time', 'Measuring over time'),
	},
	{
		id: 'retention',
		term: 'Retention',
		aliases: ['retention', 'Retention'],
		short: 'How long data is kept before it is deleted.',
		explanation:
			'Stores that keep data in time blocks drop a whole expired block at once, far cheaper than deleting rows one by one.',
		readMore: databases('measuring-over-time', 'Measuring over time'),
	},
	{
		id: 'rollup',
		term: 'Rollup',
		aliases: ['rollup', 'rollups', 'Rollup', 'Rollups'],
		short: 'A precomputed summary of detailed data at a lower resolution, such as one point per hour.',
		explanation:
			'It keeps long history affordable and makes repeated numbers cheap to show.',
		readMore: databases('measuring-over-time', 'Measuring over time'),
	},
	{
		id: 'percentile',
		term: 'Percentile',
		aliases: ['percentile', 'percentiles', 'Percentile'],
		short: 'The value below which a given share of measurements falls.',
		explanation:
			'The 99th percentile of latency is the time that 99% of requests beat. It shows slow requests that an average hides.',
		readMore: { href: 'https://en.wikipedia.org/wiki/Percentile', label: 'Wikipedia: Percentile' },
	},
	{
		id: 'analytics-store',
		term: 'Analytics store',
		aliases: ['analytics store', 'analytics stores', 'Analytics store'],
		short: 'A separate store, usually with column storage, for large scans and totals over business events.',
		explanation:
			'It answers new questions over long history without slowing the app. Data arrives in batches or as a stream, so reports lag.',
		readMore: databases('answering-new-questions-over-all-events', 'Answering new questions over all events'),
	},
	{
		id: 'inverted-index',
		term: 'Inverted index',
		aliases: ['inverted index', 'inverted indexes', 'Inverted index'],
		short: 'An index from each word to the list of records that contain it.',
		explanation:
			'It finds records by words inside text, which a B-tree index cannot do.',
		readMore: databases('searching-by-words', 'Searching by words'),
	},
	{
		id: 'search-engine',
		term: 'Search engine',
		aliases: ['search engine', 'search engines', 'Search engine'],
		short: 'A separate store built for full-text search, such as Elasticsearch or OpenSearch.',
		explanation:
			'It adds language analysis, tuned relevance, and facets. In most designs it holds a copy of data owned elsewhere, which lags behind.',
		readMore: databases('searching-by-words', 'Searching by words'),
	},
	{
		id: 'embedding',
		term: 'Embedding',
		aliases: ['embedding', 'embeddings', 'Embedding'],
		short: 'A vector of numbers that a model computes from a text or an image.',
		explanation:
			'Similar meanings get vectors close to each other, so a nearest-neighbor search finds similar items. Vectors from different models cannot be compared.',
		readMore: databases('searching-by-meaning', 'Searching by meaning'),
	},
	{
		id: 'recall',
		term: 'Recall',
		aliases: ['recall', 'Recall'],
		short: 'The share of the true nearest neighbors that an approximate search returns.',
		explanation:
			'Approximate indexes trade recall for speed and memory.',
		readMore: databases('searching-by-meaning', 'Searching by meaning'),
	},
	{
		id: 'hnsw',
		term: 'HNSW',
		aliases: ['HNSW'],
		expansion: 'Hierarchical navigable small world',
		short: 'An approximate vector index built as a layered graph of nearby vectors.',
		explanation:
			'It is fast with good recall, but takes memory and time to build.',
		readMore: postgresql('searching-by-meaning', 'Searching by meaning'),
	},
	{
		id: 'ivf',
		term: 'IVF',
		aliases: ['IVF', 'IVFFlat'],
		expansion: 'Inverted file index',
		short: 'An approximate vector index that groups vectors into clusters and searches only the nearest clusters.',
		explanation:
			'It builds faster and uses less memory than HNSW, with lower speed or recall.',
		readMore: postgresql('searching-by-meaning', 'Searching by meaning'),
	},
	{
		id: 'system-of-record',
		term: 'System of record',
		aliases: ['system of record', 'System of record'],
		short: 'The store that owns a fact: it is written first and wins when copies disagree.',
		explanation:
			'Every other copy of the fact is derived from it.',
		readMore: databases('deciding-who-owns-each-fact', 'Deciding who owns each fact'),
	},
	{
		id: 'derived-data',
		term: 'Derived data',
		aliases: ['derived data', 'Derived data'],
		short: 'Data built from other data, such as a cache, a search index, or a rollup.',
		explanation:
			'It can be rebuilt from its inputs while they are kept, and it needs a stated delay and a way to receive deletes.',
		readMore: databases('deciding-who-owns-each-fact', 'Deciding who owns each fact'),
	},
	{
		id: 'dual-writes',
		term: 'Dual writes',
		aliases: ['dual writes', 'dual write', 'Dual writes'],
		short: 'Writing the same change from the app to several stores, one after another.',
		explanation:
			'One write can fail after the other succeeded, and concurrent writes can arrive in different orders, which leaves the stores different without any error.',
		readMore: databases('deciding-who-owns-each-fact', 'Deciding who owns each fact'),
	},
	{
		id: 'cdc',
		term: 'CDC',
		aliases: ['CDC', 'change data capture', 'Change data capture'],
		expansion: 'Change data capture',
		short: 'Capturing the committed changes of a database, often from its log, and sending them to other systems.',
		explanation:
			'Derived stores follow the owner without dual writes from the app. Consumers must apply the changes of one record in order.',
		readMore: databases('deciding-who-owns-each-fact', 'Deciding who owns each fact'),
	},
	{
		id: 'outbox',
		term: 'Outbox',
		aliases: ['outbox', 'Outbox', 'transactional outbox'],
		short: 'A table where the app writes an event in the same transaction as the change it describes.',
		explanation:
			'The change and its event commit together or not at all. A separate process delivers the events later and may retry.',
		readMore: databases('deciding-who-owns-each-fact', 'Deciding who owns each fact'),
	},
	{
		id: 'cqrs',
		term: 'CQRS',
		aliases: ['CQRS'],
		expansion: 'Command query responsibility segregation',
		short: 'Using separate models for writing data and for reading it.',
		explanation:
			'Reads get models shaped for them, which follow the write model with some delay.',
		readMore: { href: 'https://martinfowler.com/bliki/CQRS.html', label: 'Martin Fowler: CQRS' },
	},
	{
		id: 'event-sourcing',
		term: 'Event sourcing',
		aliases: ['event sourcing', 'Event sourcing'],
		short: 'Storing every change as an event and deriving the current state from the events.',
		explanation:
			'The full history is kept and views can be rebuilt. Deleting data and changing event formats become harder.',
		readMore: { href: 'https://martinfowler.com/eaaDev/EventSourcing.html', label: 'Martin Fowler: Event Sourcing' },
	},
	{
		id: 'ram',
		term: 'RAM',
		aliases: ['RAM'],
		expansion: 'Random-access memory',
		short: 'The main memory of a server: fast, but lost on restart and much more expensive than disk.',
		explanation:
			'Data and indexes that fit in RAM are read without disk access.',
		readMore: { href: 'https://en.wikipedia.org/wiki/Random-access_memory', label: 'Wikipedia: Random-access memory' },
	},
	{
		id: 'hash-map',
		term: 'Hash map',
		aliases: ['hash map', 'hash maps', 'Hash map'],
		short: 'An in-memory structure that finds a value by its key in constant time.',
		explanation:
			'It keeps no order, so it finds one key but cannot return a range of keys.',
		readMore: { href: 'https://en.wikipedia.org/wiki/Hash_table', label: 'Wikipedia: Hash table' },
	},
	{
		id: 'balanced-tree',
		term: 'Balanced tree',
		aliases: ['balanced tree', 'balanced trees', 'Balanced tree'],
		short: 'A sorted tree that keeps all paths from the root to the leaves about the same length.',
		explanation:
			'Lookups, inserts, and range reads stay fast as the tree grows. Red-black and AVL trees are common in memory.',
		readMore: { href: 'https://en.wikipedia.org/wiki/Self-balancing_binary_search_tree', label: 'Wikipedia: Self-balancing binary search tree' },
	},
	{
		id: 'merge-sort',
		term: 'Merge sort',
		aliases: ['merge sort', 'Merge sort'],
		short: 'A sorting method that sorts parts separately and then merges the sorted parts in one pass.',
		explanation:
			'Merging sorted inputs reads each of them once, in order, which suits files on disk.',
		readMore: { href: 'https://en.wikipedia.org/wiki/Merge_sort', label: 'Wikipedia: Merge sort' },
	},
	{
		id: 'replication',
		term: 'Replication',
		aliases: ['replication', 'Replication', 'replicated', 'replicate', 'replicates'],
		short: 'Keeping a copy of the same data on several nodes.',
		explanation:
			'Copies let the data survive the loss of a node, spread reads, and sit close to users. The hard part is keeping them in step while the data changes.',
		readMore: replication('keeping-a-copy-on-another-node', 'Keeping a copy on another node'),
	},
	{
		id: 'replica',
		term: 'Replica',
		aliases: ['replica', 'replicas', 'Replica', 'Replicas'],
		short: 'One copy of the data in a replicated system.',
		explanation:
			'In a leader-based design, a replica is either the leader or a follower.',
		readMore: replication('keeping-a-copy-on-another-node', 'Keeping a copy on another node'),
	},
	{
		id: 'leader',
		term: 'Leader',
		aliases: ['leader', 'leaders', 'Leader', 'Leaders'],
		short: 'The replica that accepts writes and decides their order.',
		explanation:
			'It sends each change to the followers through the replication log. Products also call it the primary or the source.',
		readMore: replication('keeping-a-copy-on-another-node', 'Keeping a copy on another node'),
	},
	{
		id: 'follower',
		term: 'Follower',
		aliases: ['follower', 'followers', 'Follower', 'Followers', 'read replica', 'read replicas'],
		explainedIn: ['fundamentals/databases'],
		short: 'A replica that applies the changes of a leader in the same order.',
		explanation:
			'It serves reads and can become the leader after a failover. Products also call it a secondary, a standby, or a read replica.',
		readMore: replication('keeping-a-copy-on-another-node', 'Keeping a copy on another node'),
	},
	{
		id: 'replication-log',
		term: 'Replication log',
		aliases: ['replication log', 'Replication log', 'replication logs'],
		short: 'The stream of changes that a leader sends to its followers, in the order it applied them.',
		explanation:
			'It can carry statements, pages of the WAL, or changed rows. A position in it measures how far a follower has got.',
		readMore: replication('keeping-a-copy-on-another-node', 'Keeping a copy on another node'),
	},
	{
		id: 'synchronous-replication',
		term: 'Synchronous replication',
		aliases: ['synchronous replication', 'Synchronous replication', 'synchronous follower', 'synchronous followers'],
		short: 'Replication where the leader confirms a write only after a follower has saved it.',
		explanation:
			'A confirmed write survives the loss of the leader if failover promotes a follower that has it. Every write waits for the follower, and writes stop when it fails.',
		readMore: replication('deciding-when-a-write-is-done', 'Deciding when a write is done'),
	},
	{
		id: 'asynchronous-replication',
		term: 'Asynchronous replication',
		aliases: ['asynchronous replication', 'Asynchronous replication', 'asynchronous follower', 'asynchronous followers'],
		short: 'Replication where confirming a write does not wait for followers.',
		explanation:
			'Writes are fast and do not depend on followers, but a confirmed write can be lost if the leader fails before a follower gets it.',
		readMore: replication('deciding-when-a-write-is-done', 'Deciding when a write is done'),
	},
	{
		id: 'semi-synchronous-replication',
		term: 'Semi-synchronous replication',
		aliases: ['semi-synchronous replication', 'Semi-synchronous replication', 'semi-synchronous', 'Semi-synchronous'],
		short: 'Replication with one synchronous follower and the rest asynchronous.',
		explanation:
			'While the synchronous follower answers, every confirmed write is on two nodes. Some products fall back to asynchronous replication when it does not answer in time.',
		readMore: replication('deciding-when-a-write-is-done', 'Deciding when a write is done'),
	},
	{
		id: 'statement-based-replication',
		term: 'Statement-based replication',
		aliases: ['statement-based replication', 'Statement-based replication', 'statement logs'],
		short: 'Replication that sends each write statement for followers to run again.',
		explanation:
			'The log is small, but statements such as UUID() or an update with LIMIT can give a different result on each replica.',
		readMore: replication('choosing-what-the-log-carries', 'Choosing what the log carries'),
	},
	{
		id: 'physical-replication',
		term: 'Physical replication',
		aliases: ['physical replication', 'Physical replication', 'physical log', 'physical logs', 'WAL shipping'],
		short: 'Replication that sends the changed bytes of pages from the WAL.',
		explanation:
			'Followers become exact copies, but every replica needs the same storage format, usually the same major version, so a major upgrade usually needs downtime.',
		readMore: replication('choosing-what-the-log-carries', 'Choosing what the log carries'),
	},
	{
		id: 'logical-replication',
		term: 'Logical replication',
		aliases: ['logical replication', 'Logical replication', 'logical log', 'logical row logs', 'row-based replication'],
		short: 'Replication that sends changed rows instead of statements or pages.',
		explanation:
			'Replicas can run different compatible versions, which allows an upgrade with a short switch, and other systems can read the same log for CDC.',
		readMore: replication('choosing-what-the-log-carries', 'Choosing what the log carries'),
	},
	{
		id: 'log-position',
		term: 'Log position',
		aliases: ['log position', 'log positions', 'Log position'],
		short: 'A point in a replication log, such as the number of the last change a replica applied.',
		explanation:
			'A new follower starts from the position of its snapshot. The gap between the leader and a follower shows how much log is still to apply.',
		readMore: replication('starting-a-new-copy', 'Starting a new copy'),
	},
	{
		id: 'backup',
		term: 'Backup',
		aliases: ['backup', 'backups', 'Backup', 'Backups'],
		short: 'A copy of data as it was at an earlier moment.',
		explanation:
			'Replicas copy a bad write within seconds, so recovering data from before it needs an older copy. A backup is proven only by a test restore.',
		readMore: replication('undoing-a-bad-write', 'Undoing a bad write'),
	},
	{
		id: 'point-in-time-recovery',
		term: 'Point-in-time recovery',
		aliases: ['point-in-time recovery', 'Point-in-time recovery'],
		short: 'Restoring a database to a chosen moment covered by a snapshot and an unbroken archived log.',
		explanation:
			'Restore the last snapshot before a mistake and replay the log up to just before it.',
		readMore: replication('undoing-a-bad-write', 'Undoing a bad write'),
	},
	{
		id: 'replication-lag',
		term: 'Replication lag',
		aliases: ['replication lag', 'Replication lag'],
		short: 'The delay between a write on the leader and the same write on a follower.',
		explanation:
			'It is usually under a second but has no upper limit, and reads from a follower that is behind return old data.',
		readMore: replication('reading-from-a-copy-that-is-behind', 'Reading from a copy that is behind'),
	},
	{
		id: 'stale-read',
		term: 'Stale read',
		aliases: ['stale read', 'stale reads', 'Stale read', 'Stale reads'],
		short: 'A read that returns an older version of data than the latest write.',
		explanation:
			'It happens on a replica that has not applied the write yet. Decide for each read whether an old answer is acceptable.',
		readMore: replication('reading-from-a-copy-that-is-behind', 'Reading from a copy that is behind'),
	},
	{
		id: 'eventual-consistency',
		term: 'Eventual consistency',
		aliases: ['eventual consistency', 'Eventual consistency', 'eventually consistent', 'Eventually consistent'],
		short: 'The promise that replicas match once writes stop and every change can arrive.',
		explanation:
			'It says nothing about how long that takes or what a read returns in the meantime. Session guarantees need extra routing or freshness checks.',
		readMore: replication('reading-from-a-copy-that-is-behind', 'Reading from a copy that is behind'),
	},
	{
		id: 'read-your-writes',
		term: 'Read-your-writes',
		aliases: ['read-your-writes', 'Read-your-writes', 'read-after-write consistency'],
		short: 'The guarantee that a user\'s reads include the user\'s own completed writes.',
		explanation:
			'Read a user\'s own data from the leader, or only from replicas that have applied the user\'s last write.',
		readMore: replication('seeing-your-own-writes', 'Seeing your own writes'),
	},
	{
		id: 'monotonic-reads',
		term: 'Monotonic reads',
		aliases: ['monotonic reads', 'Monotonic reads'],
		short: 'The guarantee that a user never sees older data after seeing newer data.',
		explanation:
			'Keep each user on one replica while it is up, and track the newest position the user has seen to stay safe after a switch.',
		readMore: replication('not-going-back-in-time', 'Not going back in time'),
	},
	{
		id: 'consistent-prefix-reads',
		term: 'Consistent prefix reads',
		aliases: ['consistent prefix reads', 'Consistent prefix reads', 'consistent prefix', 'Consistent prefix'],
		short: 'The guarantee that readers see writes in the order they happened.',
		explanation:
			'One query to one replica of one log gives it. It breaks when a page combines reads taken at different points, such as different shards or two queries.',
		readMore: replication('seeing-writes-in-order', 'Seeing writes in order'),
	},
	{
		id: 'failover',
		term: 'Failover',
		aliases: ['failover', 'failovers', 'Failover'],
		short: 'Moving work to another instance when the active one fails.',
		explanation:
			'In replication, a follower that has every confirmed write becomes the leader. A timeout only suspects the failure, so the old leader must be fenced.',
		readMore: replication('replacing-a-failed-leader', 'Replacing a failed leader'),
	},
	{
		id: 'split-brain',
		term: 'Split brain',
		aliases: ['split brain', 'Split brain'],
		short: 'Two nodes acting as leader at the same time.',
		explanation:
			'Both accept writes, and the writes conflict. It happens when an old leader was only slow or cut off.',
		readMore: replication('replacing-a-failed-leader', 'Replacing a failed leader'),
	},
	{
		id: 'fencing',
		term: 'Fencing',
		aliases: ['fencing', 'Fencing'],
		short: 'Stopping an old leader from writing after a new one takes over.',
		explanation:
			'Each new leader gets a higher number, and nodes reject writes with an older one. A timeout alone does not prove the old leader stopped.',
		readMore: replication('replacing-a-failed-leader', 'Replacing a failed leader'),
	},
	{
		id: 'availability-zone',
		term: 'Availability zone',
		aliases: ['availability zone', 'availability zones', 'Availability zone', 'Availability zones'],
		short: 'One of several separate failure areas in a cloud region, with one or more data centers.',
		explanation:
			'Zones are close enough for synchronous replication. Replicas spread over zones survive the loss of a zone, but not of the whole region.',
		readMore: replication('deciding-when-a-write-is-done', 'Deciding when a write is done'),
	},
	{
		id: 'multi-leader-replication',
		term: 'Multi-leader replication',
		aliases: ['multi-leader replication', 'Multi-leader replication', 'multi-leader', 'Multi-leader'],
		short: 'Replication where several leaders accept writes and replicate them to each other.',
		explanation:
			'Each region writes locally and survives being cut off, but concurrent writes conflict and rules over all the data cannot be checked.',
		readMore: replication('writing-from-several-regions', 'Writing from several regions'),
	},
	{
		id: 'version-vector',
		term: 'Version vector',
		aliases: ['version vector', 'version vectors', 'Version vector', 'Version vectors'],
		short: 'A counter per replica for each key that shows which writes a version has seen.',
		explanation:
			'Comparing two vectors tells whether one write replaced the other or both were concurrent. A timestamp cannot tell.',
		readMore: replication('resolving-conflicting-writes', 'Resolving conflicting writes'),
	},
	{
		id: 'last-write-wins',
		term: 'Last write wins',
		aliases: ['last write wins', 'Last write wins', 'LWW'],
		short: 'Resolving a conflict by keeping the write with the latest timestamp.',
		explanation:
			'Replicas converge, but the other write is lost without an error, and clocks that differ can make an older write win.',
		readMore: replication('resolving-conflicting-writes', 'Resolving conflicting writes'),
	},
	{
		id: 'siblings',
		term: 'Siblings',
		aliases: ['siblings', 'Siblings'],
		short: 'Concurrent versions of one record that a database keeps instead of choosing one.',
		explanation:
			'The app merges them on the next read or asks the user.',
		readMore: replication('resolving-conflicting-writes', 'Resolving conflicting writes'),
	},
	{
		id: 'crdt',
		term: 'CRDT',
		aliases: ['CRDT', 'CRDTs'],
		expansion: 'Conflict-free replicated data type',
		short: 'A data type whose copies merge concurrent changes by a fixed rule and reach the same value.',
		explanation:
			'Each type has its own rule, for example what wins when an add and a remove are concurrent. Replicas converge without a central order.',
		readMore: replication('resolving-conflicting-writes', 'Resolving conflicting writes'),
	},
	{
		id: 'leaderless-replication',
		term: 'Leaderless replication',
		aliases: ['leaderless replication', 'Leaderless replication', 'leaderless', 'Leaderless'],
		short: 'Replication where any replica accepts writes and clients write to and read from several replicas.',
		explanation:
			'No leader promotion is needed when a replica fails. Reads and writes go on while enough replicas answer; concurrent writes still need a conflict rule.',
		readMore: replication('writing-without-a-leader', 'Writing without a leader'),
	},
	{
		id: 'quorum',
		term: 'Quorum',
		aliases: ['quorum', 'quorums', 'Quorum', 'Quorums'],
		short: 'The number of replicas that must answer a read or a write.',
		explanation:
			'With N replicas, W write answers, and R read answers, W + R > N makes the read and write sets overlap, so a read usually reaches the latest confirmed write. It is not a strong guarantee.',
		readMore: replication('writing-without-a-leader', 'Writing without a leader'),
		explainedIn: ['technologies/redis'],
	},
	{
		id: 'read-repair',
		term: 'Read repair',
		aliases: ['read repair', 'Read repair'],
		short: 'Fixing an old replica during a read by writing the newest or missing versions back to it.',
		explanation:
			'It repairs keys that are read often and leaves rarely read keys old.',
		readMore: replication('repairing-copies-that-missed-writes', 'Repairing copies that missed writes'),
	},
	{
		id: 'hinted-handoff',
		term: 'Hinted handoff',
		aliases: ['hinted handoff', 'Hinted handoff'],
		short: 'Storing writes for a replica that is down on another node and passing them on when it returns.',
		explanation:
			'It covers short outages. Data held only as hints is not readable from the key\'s own replicas.',
		readMore: replication('repairing-copies-that-missed-writes', 'Repairing copies that missed writes'),
	},
	{
		id: 'sloppy-quorum',
		term: 'Sloppy quorum',
		aliases: ['sloppy quorum', 'sloppy quorums', 'Sloppy quorum'],
		short: 'Counting writes on substitute nodes toward a quorum when the usual replicas do not answer.',
		explanation:
			'Writes keep succeeding during failures, but reads from the usual replicas may miss them until the handoff.',
		readMore: replication('writing-without-a-leader', 'Writing without a leader'),
	},
	{
		id: 'anti-entropy',
		term: 'Anti-entropy',
		aliases: ['anti-entropy', 'Anti-entropy'],
		short: 'A background process that compares replicas and copies the data they are missing.',
		explanation:
			'It repairs keys that are never read and costs disk and network time. It must cover every replica before deletes are purged, or deleted data comes back.',
		readMore: replication('repairing-copies-that-missed-writes', 'Repairing copies that missed writes'),
	},
	{
		id: 'merkle-tree',
		term: 'Merkle tree',
		aliases: ['Merkle tree', 'Merkle trees'],
		short: 'A tree of hashes in which each parent hash covers the hashes below it.',
		explanation:
			'Two replicas compare the roots and walk down only where hashes differ, so they find different ranges without sending all the data.',
		readMore: replication('repairing-copies-that-missed-writes', 'Repairing copies that missed writes'),
	},
	{
		id: 'shard',
		term: 'Shard',
		aliases: ['shard', 'shards', 'Shard', 'Shards', 'sharding', 'Sharding', 'sharded'],
		short: 'One part of a dataset that is split across nodes; sharding is the split itself.',
		explanation:
			'Each row lives in exactly one shard, and each shard has its own leader and followers, so data and writes can grow past one machine.',
		readMore: sharding('splitting-a-table-across-nodes', 'Splitting a table across nodes'),
	},
	{
		id: 'concurrent-writes',
		term: 'Concurrent writes',
		aliases: ['concurrent writes', 'Concurrent writes'],
		short: 'Writes to the same data where neither knew about the other.',
		explanation:
			'Time does not matter: edits hours apart on two offline devices are concurrent. With several leaders or no leader, they conflict and must be resolved.',
		readMore: replication('resolving-conflicting-writes', 'Resolving conflicting writes'),
	},
	{
		id: 'rpo',
		term: 'RPO',
		aliases: ['RPO'],
		expansion: 'Recovery point objective',
		short: 'The largest window of recent data a system may lose in a failure, set as a target.',
		explanation:
			'A failover to an asynchronous follower typically loses up to its lag. Synchronous replication can bring it to zero for the loss of one node.',
		readMore: replication('replacing-a-failed-leader', 'Replacing a failed leader'),
	},
	{
		id: 'rto',
		term: 'RTO',
		aliases: ['RTO'],
		expansion: 'Recovery time objective',
		short: 'The longest time a system may take to recover from a failure, set as a target.',
		explanation:
			'A failover takes seconds to minutes. A restore of a large database from backups can take hours.',
		readMore: replication('replacing-a-failed-leader', 'Replacing a failed leader'),
	},
	{
		id: 'cap',
		term: 'CAP',
		aliases: ['CAP'],
		expansion: 'Consistency, availability, partition tolerance',
		short: 'The rule that during a network break a replicated system either refuses some requests or lets copies disagree.',
		explanation:
			'It applies only while the network is split. In normal work the trade-off is between latency and consistency.',
		readMore: consistency('answering-during-a-network-partition', 'Answering during a network partition'),
	},
	{
		id: 'monotonic-writes',
		term: 'Monotonic writes',
		aliases: ['monotonic writes', 'Monotonic writes'],
		short: 'The guarantee that a user\'s writes apply in the order the user made them.',
		explanation:
			'One leader with an intact log gives it to a user who waits for each write. Failover, parallel requests, or several leaders need tracking.',
		readMore: replication('seeing-writes-in-order', 'Seeing writes in order'),
	},
	{
		id: 'writes-follow-reads',
		term: 'Writes follow reads',
		aliases: ['writes follow reads', 'Writes follow reads', 'writes-follow-reads'],
		short: 'The guarantee that a write applies after the writes its author had read.',
		explanation:
			'A reply is never applied before the post it answers. One leader with an intact log gives it to a user who waits for each write.',
		readMore: replication('seeing-writes-in-order', 'Seeing writes in order'),
	},
	{
		id: 'linearizability',
		term: 'Linearizability',
		aliases: ['linearizability', 'Linearizability', 'linearizable', 'Linearizable', 'strong consistency', 'Strong consistency'],
		short: 'The guarantee that all reads and writes fit one order on a single copy, matching real time.',
		explanation:
			'Once a write finishes, every later read returns it or a newer value. It needs coordination between copies, so it costs latency and makes some nodes refuse requests during a network partition.',
		readMore: consistency('acting-as-one-copy', 'Acting as one copy'),
	},
	{
		id: 'network-partition',
		term: 'Network partition',
		aliases: ['network partition', 'network partitions', 'Network partition', 'Network partitions'],
		short: 'A network failure that splits nodes into groups that cannot reach each other.',
		explanation:
			'During a partition, a system with copies cannot both stay linearizable and complete every request. A node sees a partition only as a timeout.',
		readMore: consistency('answering-during-a-network-partition', 'Answering during a network partition'),
	},
	{
		id: 'pacelc',
		term: 'PACELC',
		aliases: ['PACELC'],
		short: 'The rule that adds to CAP: without a partition, a system trades latency against consistency.',
		explanation:
			'Every operation that must confirm with other copies waits for the network, even when nothing fails.',
		readMore: consistency('paying-for-consistency-without-failures', 'Paying for consistency without failures'),
	},
	{
		id: 'bounded-staleness',
		term: 'Bounded staleness',
		aliases: ['bounded staleness', 'Bounded staleness'],
		short: 'A guarantee that a read is behind by no more than a set number of versions or seconds.',
		explanation:
			'It sits between linearizable and eventual reads, and lets reads come from a nearby copy while limiting how old they are.',
		readMore: consistency('paying-for-consistency-without-failures', 'Paying for consistency without failures'),
	},
	{
		id: 'causal-consistency',
		term: 'Causal consistency',
		aliases: ['causal consistency', 'Causal consistency', 'causally consistent'],
		short: 'The guarantee that writes which depend on each other show up in the same order on every node.',
		explanation:
			'Concurrent writes may show up in different orders. It can keep working during a network partition for clients that stay with a copy holding their past.',
		readMore: consistency('keeping-cause-before-effect', 'Keeping cause before effect'),
	},
	{
		id: 'sequential-consistency',
		term: 'Sequential consistency',
		aliases: ['sequential consistency', 'Sequential consistency'],
		short: 'The guarantee that all operations fit one order that keeps each client\'s own order.',
		explanation:
			'The order need not follow real time between clients, so a read may miss a write another client has finished. Like linearizability, it makes some nodes refuse requests during a partition.',
		readMore: consistency('keeping-cause-before-effect', 'Keeping cause before effect'),
	},
	{
		id: 'time-of-day-clock',
		term: 'Time-of-day clock',
		aliases: ['time-of-day clock', 'time-of-day clocks', 'Time-of-day clock', 'wall clock', 'wall-clock'],
		short: 'A clock that returns the date and time, corrected by a sync service such as NTP.',
		explanation:
			'It can jump forward or back, and clocks on different machines are not guaranteed to agree, so its timestamps cannot order close events on different nodes.',
		readMore: consistency('clocks-that-disagree', 'Clocks that disagree'),
	},
	{
		id: 'monotonic-clock',
		term: 'Monotonic clock',
		aliases: ['monotonic clock', 'monotonic clocks', 'Monotonic clock'],
		short: 'A clock that only moves forward, used to measure time passed on one machine.',
		explanation:
			'Use it for timeouts and durations. Its values cannot be compared across machines.',
		readMore: consistency('clocks-that-disagree', 'Clocks that disagree'),
	},
	{
		id: 'clock-skew',
		term: 'Clock skew',
		aliases: ['clock skew', 'Clock skew'],
		short: 'The difference between the readings of two clocks at the same moment.',
		explanation:
			'It grows between syncs because clocks run at slightly different speeds, which is clock drift. An ordinary clock reading does not show it.',
		readMore: consistency('clocks-that-disagree', 'Clocks that disagree'),
	},
	{
		id: 'clock-drift',
		term: 'Clock drift',
		aliases: ['clock drift', 'Clock drift'],
		short: 'The difference in how fast two clocks run.',
		explanation:
			'A quartz clock that drifts by 200 parts per million, a common assumption, gains about 17 seconds a day without syncing.',
		readMore: consistency('clocks-that-disagree', 'Clocks that disagree'),
	},
	{
		id: 'happens-before',
		term: 'Happens-before',
		aliases: ['happens-before', 'Happens-before', 'happens before'],
		short: 'The order of events in which one event could have affected another: earlier in the same process, or through a message.',
		explanation:
			'Events where neither happens before the other are concurrent, whatever the clocks say.',
		readMore: consistency('ordering-events-by-cause', 'Ordering events by cause'),
	},
	{
		id: 'lamport-clock',
		term: 'Lamport clock',
		aliases: ['Lamport clock', 'Lamport clocks', 'Lamport timestamp', 'Lamport timestamps'],
		short: 'A counter that gives every event a number, so that an event that happens before another gets a smaller one.',
		explanation:
			'Each message carries the counter, and a receiver jumps past it. The pair (counter, process ID) gives one sort order that respects cause, but cannot detect concurrent events.',
		readMore: consistency('ordering-events-by-cause', 'Ordering events by cause'),
	},
	{
		id: 'vector-clock',
		term: 'Vector clock',
		aliases: ['vector clock', 'vector clocks', 'Vector clock'],
		short: 'A set of counters, one per node, attached to events to detect which ones are concurrent.',
		explanation:
			'It shows whether one event happens before another or neither does, at the cost of a counter per node in every message.',
		readMore: consistency('ordering-events-by-cause', 'Ordering events by cause'),
	},
	{
		id: 'state-machine-replication',
		term: 'State machine replication',
		aliases: ['state machine replication', 'State machine replication'],
		short: 'Keeping replicas equal by applying the same deterministic commands in the same order from the same state.',
		explanation:
			'Consensus agrees on the order of the commands in a log. Values that could differ between replicas, such as timestamps, are chosen once and stored in the command.',
		readMore: consistency('agreeing-on-one-value', 'Agreeing on one value'),
	},
	{
		id: 'raft-term',
		term: 'Term',
		aliases: ['Raft term', 'Raft terms'],
		short: 'In Raft, the number of an election period, with at most one leader per term.',
		explanation:
			'Every message carries the term, and nodes reject older terms, which stops an old leader.',
		readMore: consistency('choosing-a-leader-everyone-accepts', 'Choosing a leader everyone accepts'),
	},
	{
		id: 'election-timeout',
		term: 'Election timeout',
		aliases: ['election timeout', 'election timeouts', 'Election timeout'],
		short: 'How long a follower waits without hearing from the leader before it starts an election.',
		explanation:
			'Raft picks it at random from a range; the paper\'s example is 150 to 300 ms. When a leader fails, writes pause for about this long plus the election.',
		readMore: consistency('choosing-a-leader-everyone-accepts', 'Choosing a leader everyone accepts'),
	},
	{
		id: 'coordination-service',
		term: 'Coordination service',
		aliases: ['coordination service', 'coordination services', 'Coordination service'],
		short: 'A small consensus group, such as etcd, ZooKeeper, or Consul, that other systems use for locks, leaders, and configuration.',
		explanation:
			'It stores small keys with linearizable writes, leases, and watches. It is meant for shared metadata; app data belongs in a database that spreads it over many groups.',
		readMore: consistency('letting-only-one-node-act', 'Letting only one node act'),
	},
	{
		id: 'lease',
		term: 'Lease',
		aliases: ['lease', 'leases', 'Lease', 'Leases'],
		short: 'A right, such as a lock, that lasts a set time and must be renewed.',
		explanation:
			'When the holder stops renewing it, the lease runs out and another holder can take over. A lease that guards outside work needs a fencing token or work that is safe to repeat, since a paused holder may still act.',
		readMore: consistency('committing-through-a-majority', 'Committing through a majority'),
		explainedIn: ['fundamentals/caching'],
	},
	{
		id: 'fencing-token',
		term: 'Fencing token',
		aliases: ['fencing token', 'fencing tokens', 'Fencing token'],
		short: 'A number that grows with every grant of a lock, checked by the system that receives the work.',
		explanation:
			'The receiver durably keeps the largest token it has accepted and, in the same atomic operation as the change, rejects older ones. A stale holder is stopped only where a newer token has already arrived.',
		readMore: consistency('letting-only-one-node-act', 'Letting only one node act'),
	},
	{
		id: 'atomic-commit',
		term: 'Atomic commit',
		aliases: ['atomic commit', 'Atomic commit'],
		short: 'Committing a change on every node it touches, or on none.',
		explanation:
			'Two-phase commit provides it. Without it, a process that stops between two writes on two nodes leaves the change half done.',
		readMore: consistency('committing-on-several-nodes', 'Committing on several nodes'),
	},
	{
		id: 'in-doubt',
		term: 'In doubt',
		aliases: ['in doubt', 'in-doubt'],
		short: 'The state of a two-phase commit participant that voted yes but has not learned the decision.',
		explanation:
			'It must wait and keep its locks until the coordinator answers, since aborting on its own could break atomicity.',
		readMore: consistency('committing-on-several-nodes', 'Committing on several nodes'),
	},
	{
		id: 'timestamp-oracle',
		term: 'Timestamp oracle',
		aliases: ['timestamp oracle', 'Timestamp oracle'],
		short: 'One service that hands out increasing timestamps to transactions.',
		explanation:
			'It gives an exact order, but every transaction waits for its answers, so it should sit close to them and be replicated. Percolator and TiDB use one.',
		readMore: consistency('ordering-transactions-across-nodes-by-time', 'Ordering transactions across nodes by time'),
	},
	{
		id: 'truetime',
		term: 'TrueTime',
		aliases: ['TrueTime'],
		short: 'Spanner\'s clock, which returns an interval that surely contains the real time.',
		explanation:
			'GPS receivers and atomic clocks keep the interval to a few milliseconds, and commit wait uses it to order transactions by real time.',
		readMore: consistency('ordering-transactions-across-nodes-by-time', 'Ordering transactions across nodes by time'),
	},
	{
		id: 'commit-wait',
		term: 'Commit wait',
		aliases: ['commit wait', 'Commit wait'],
		short: 'Waiting until a commit timestamp is surely in the past before showing the commit.',
		explanation:
			'Any transaction that starts later then gets a larger timestamp. The wait depends on the clock error, and part of it can overlap other work of the commit.',
		readMore: consistency('ordering-transactions-across-nodes-by-time', 'Ordering transactions across nodes by time'),
	},
	{
		id: 'hybrid-logical-clock',
		term: 'Hybrid logical clock',
		aliases: ['hybrid logical clock', 'hybrid logical clocks', 'Hybrid logical clock', 'HLC'],
		short: 'A timestamp made of physical time plus a counter, which never goes back and stays close to real time.',
		explanation:
			'Timestamps respect cause, never go back, and stay close to real time, but do not prove real-time order. A database adds isolation and rules for clock skew on top.',
		readMore: consistency('ordering-transactions-across-nodes-by-time', 'Ordering transactions across nodes by time'),
	},
	{
		id: 'strict-serializability',
		term: 'Strict serializability',
		aliases: ['strict serializability', 'Strict serializability', 'strictly serializable', 'external consistency'],
		short: 'Serializable transactions in an order that matches real time.',
		explanation:
			'A transaction that commits before another starts comes first. Spanner provides it with commit wait.',
		readMore: consistency('ordering-transactions-across-nodes-by-time', 'Ordering transactions across nodes by time'),
	},
	{
		id: 'compensating-transaction',
		term: 'Compensating transaction',
		aliases: ['compensating transaction', 'compensating transactions', 'Compensating transaction', 'compensation', 'compensations'],
		short: 'A step that undoes the business effect of an earlier step, such as a refund for a charge.',
		explanation:
			'It is a new change, not an erase: both stay in the records. A saga that gives up before its pivot runs compensations in reverse order.',
		readMore: consistency('steps-that-cannot-be-rolled-back', 'Steps that cannot be rolled back'),
	},
	{
		id: 'pivot-transaction',
		term: 'Pivot',
		aliases: ['pivot', 'pivot transaction'],
		short: 'The step of a saga after which it can no longer be undone and must finish.',
		explanation:
			'Steps before it have compensations; steps after it are retried until they succeed.',
		readMore: consistency('steps-that-cannot-be-rolled-back', 'Steps that cannot be rolled back'),
	},
	{
		id: 'semantic-lock',
		term: 'Semantic lock',
		aliases: ['semantic lock', 'semantic locks', 'Semantic lock'],
		short: 'A mark that a record is in the middle of a saga, which other operations check.',
		explanation:
			'Pending money cannot be spent, and an operation on a marked record is refused or waits until the saga ends.',
		readMore: consistency('steps-that-cannot-be-rolled-back', 'Steps that cannot be rolled back'),
	},
	{
		id: 'try-confirm-cancel',
		term: 'Try, confirm, cancel',
		aliases: ['try, confirm, cancel', 'Try, confirm, cancel', 'TCC', 'TC/C'],
		short: 'A saga form whose first step only holds a resource, and later steps confirm or release the hold.',
		explanation:
			'The middle state is a hold, not a move, so other requests see less that may be undone.',
		readMore: consistency('steps-that-cannot-be-rolled-back', 'Steps that cannot be rolled back'),
	},
	{
		id: 'raft',
		term: 'Raft',
		aliases: ['Raft'],
		short: 'A consensus algorithm in which one elected leader replicates a log to the other nodes.',
		explanation:
			'A leader commits an entry of its current term once a majority has saved it, along with every entry before it. etcd, Consul, and CockroachDB use it.',
		readMore: consistency('choosing-a-leader-everyone-accepts', 'Choosing a leader everyone accepts'),
	},
	{
		id: 'paxos',
		term: 'Paxos',
		aliases: ['Paxos', 'Multi-Paxos'],
		short: 'A family of consensus algorithms; Multi-Paxos agrees on a log of values with a stable leader.',
		explanation:
			'For a design it gives the same as Raft: a log agreed by a majority. Spanner and Chubby use it.',
		readMore: consistency('agreeing-on-one-value', 'Agreeing on one value'),
	},
	{
		id: 'zab',
		term: 'ZAB',
		aliases: ['ZAB'],
		expansion: 'ZooKeeper Atomic Broadcast',
		short: 'The consensus protocol of ZooKeeper, which orders all writes through one leader.',
		explanation:
			'It gives the same guarantees as Raft for writes; ZooKeeper reads come from any server and may be behind.',
		readMore: consistency('agreeing-on-one-value', 'Agreeing on one value'),
	},
	{
		id: 'ntp',
		term: 'NTP',
		aliases: ['NTP'],
		expansion: 'Network Time Protocol',
		short: 'A protocol that sets a machine\'s clock from servers with better clocks.',
		explanation:
			'It keeps clocks close, often within milliseconds, but a correction can move a clock back, and it gives no guaranteed bound.',
		readMore: consistency('clocks-that-disagree', 'Clocks that disagree'),
	},
	{
		id: 'xa',
		term: 'XA',
		aliases: ['XA'],
		expansion: 'eXtended Architecture',
		short: 'A standard for running two-phase commit across different products, such as a database and a message broker.',
		explanation:
			'Each product must support prepare, and every product adds its own failure and recovery cases.',
		readMore: { href: 'https://en.wikipedia.org/wiki/X/Open_XA', label: 'Wikipedia: X/Open XA' },
	},
	{
		id: 'consensus',
		term: 'Consensus',
		aliases: ['consensus', 'Consensus'],
		short: 'Several nodes agreeing on one value or one order of writes, even when some fail.',
		explanation:
			'Crash-tolerant majority protocols need 2F + 1 voting nodes to keep working after F crashes, and progress needs timely messages. Raft, Paxos, and ZAB are common algorithms.',
		readMore: consistency('agreeing-on-one-value', 'Agreeing on one value'),
	},
	{
		id: 'vertical-scaling',
		term: 'Vertical scaling',
		aliases: ['vertical scaling', 'Vertical scaling', 'scaling up', 'scale up'],
		short: 'Handling more load by moving to a bigger machine.',
		explanation:
			'The code does not change, but the largest machine is a hard ceiling, and maintenance on one huge database gets slow.',
		readMore: sharding('outgrowing-one-node', 'Outgrowing one node'),
	},
	{
		id: 'functional-partitioning',
		term: 'Functional partitioning',
		aliases: ['functional partitioning', 'Functional partitioning'],
		short: 'Moving whole features or groups of tables to their own databases.',
		explanation:
			'Each database gets smaller and can be tuned for its load, but joins and transactions no longer cross them. It cannot split one large table.',
		readMore: sharding('outgrowing-one-node', 'Outgrowing one node'),
	},
	{
		id: 'horizontal-scaling',
		term: 'Horizontal scaling',
		aliases: ['horizontal scaling', 'Horizontal scaling', 'scaling out', 'scale out'],
		short: 'Handling more load by adding machines instead of buying a bigger one.',
		explanation:
			'Stateless servers scale this way easily. Data scales this way through sharding, which needs a key, routing, and moving data.',
		readMore: sharding('splitting-a-table-across-nodes', 'Splitting a table across nodes'),
	},
	{
		id: 'shard-key',
		term: 'Shard key',
		aliases: ['shard key', 'shard keys', 'Shard key', 'sharding key'],
		short: 'The column whose value decides which shard holds a row.',
		explanation:
			'A query that names it goes to one shard; a query without it asks every shard. Changing it later means moving every row.',
		readMore: sharding('choosing-the-shard-key', 'Choosing the shard key'),
	},
	{
		id: 'co-location',
		term: 'Co-location',
		aliases: ['co-location', 'Co-location', 'co-located', 'co-locate'],
		short: 'Storing rows that are read or changed together on the same shard.',
		explanation:
			'Every related table carries the same shard key, so joins and transactions on that key stay inside one shard.',
		readMore: sharding('choosing-the-shard-key', 'Choosing the shard key'),
	},
	{
		id: 'range-partitioning',
		term: 'Range partitioning',
		aliases: ['range partitioning', 'Range partitioning', 'range sharding', 'key-range partitioning'],
		short: 'Giving each shard a contiguous range of key values.',
		explanation:
			'Range reads stay on one shard or a few neighbors, and ranges split as they grow. Keys written in order, such as timestamps, all land in the last range.',
		readMore: sharding('splitting-by-key-ranges', 'Splitting by key ranges'),
	},
	{
		id: 'hash-partitioning',
		term: 'Hash partitioning',
		aliases: ['hash partitioning', 'Hash partitioning', 'hash sharding', 'hash-based sharding'],
		short: 'Placing each row on a shard by a hash of its key.',
		explanation:
			'Neighboring keys land on different shards, so writes spread evenly whatever order keys arrive in. Key order is lost: a range read over the hashed key asks every shard.',
		readMore: sharding('splitting-by-hash-of-the-key', 'Splitting by hash of the key'),
	},
	{
		id: 'logical-shard',
		term: 'Logical shard',
		aliases: ['logical shard', 'logical shards', 'Logical shard', 'Logical shards'],
		short: 'One of a fixed number of shards, many more than nodes, that a separate map assigns to nodes.',
		explanation:
			'Keys map to shards by a hash that never changes. Adding a node moves whole shards and changes only the map.',
		readMore: sharding('adding-nodes-without-moving-every-key', 'Adding nodes without moving every key'),
	},
	{
		id: 'consistent-hashing',
		term: 'Consistent hashing',
		aliases: ['consistent hashing', 'Consistent hashing'],
		short: 'Placing nodes and keys on one ring of hash values, so that a key belongs to the next node clockwise.',
		explanation:
			'Adding or removing a node moves only about 1/N of the keys, and every client computes placement without a central map.',
		readMore: sharding('placing-keys-without-a-central-map', 'Placing keys without a central map'),
	},
	{
		id: 'virtual-node',
		term: 'Virtual node',
		aliases: ['virtual node', 'virtual nodes', 'Virtual node', 'Virtual nodes', 'vnode', 'vnodes'],
		short: 'One of many positions that a node takes on a consistent hashing ring.',
		explanation:
			'Many positions per node even out the load, spread a failed node over the rest, and let a bigger machine take more keys.',
		readMore: sharding('placing-keys-without-a-central-map', 'Placing keys without a central map'),
	},
	{
		id: 'rendezvous-hashing',
		term: 'Rendezvous hashing',
		aliases: ['rendezvous hashing', 'Rendezvous hashing', 'highest random weight hashing'],
		short: 'Sending each key to the node with the highest hash of the pair (key, node).',
		explanation:
			'Like consistent hashing, it moves few keys when nodes change, and needs no ring.',
		readMore: { href: 'https://en.wikipedia.org/wiki/Rendezvous_hashing', label: 'Wikipedia: Rendezvous hashing' },
	},
	{
		id: 'jump-consistent-hash',
		term: 'Jump consistent hash',
		aliases: ['jump consistent hash', 'Jump consistent hash', 'jump hash'],
		short: 'A short function that maps a key to one of N numbered shards with no stored state.',
		explanation:
			'Growing N moves only about 1/N of the keys. Shards are numbered in order, so only the last one can be removed.',
		readMore: { href: 'https://arxiv.org/abs/1406.2294', label: 'Lamping, Veach: A Fast, Minimal Memory, Consistent Hash Algorithm' },
	},
	{
		id: 'shard-directory',
		term: 'Shard directory',
		aliases: ['shard directory', 'shard directories', 'Shard directory', 'directory-based sharding'],
		short: 'A table that maps each key, such as a tenant, to the shard that holds it.',
		explanation:
			'It lets you place and move one tenant at a time. Every request needs a lookup, so the directory must stay available.',
		readMore: sharding('finding-the-shard-for-a-request', 'Finding the shard for a request'),
	},
	{
		id: 'rebalancing',
		term: 'Rebalancing',
		aliases: ['rebalancing', 'Rebalancing', 'rebalance', 'rebalances'],
		short: 'Moving shards between nodes so that data and load spread evenly again.',
		explanation:
			'A move copies a snapshot, streams the changes, and switches the shard map after a short write pause. Moves add load, so plan them before peaks.',
		readMore: sharding('moving-data-between-nodes', 'Moving data between nodes'),
	},
	{
		id: 'skew',
		term: 'Skew',
		aliases: ['skew', 'Skew'],
		short: 'An uneven split of data or load across shards.',
		explanation:
			'Even when keys spread evenly, some key values carry far more data or requests, such as one large tenant. The busiest shard runs out of capacity first, while others sit idle.',
		readMore: sharding('one-tenant-bigger-than-the-rest', 'One tenant bigger than the rest'),
		explainedIn: ['fundamentals/caching'],
	},
	{
		id: 'hot-shard',
		term: 'Hot shard',
		aliases: ['hot shard', 'hot shards', 'Hot shard', 'hot spot', 'hot spots'],
		short: 'A shard that gets far more load than the others.',
		explanation:
			'It runs out of capacity while other shards sit idle. Causes include a large tenant or keys written in order. One key that alone needs more than a shard is a hot key.',
		readMore: sharding('one-tenant-bigger-than-the-rest', 'One tenant bigger than the rest'),
	},
	{
		id: 'pool-model',
		term: 'Pool model',
		aliases: ['pool model', 'Pool model', 'pooled', 'Pooled'],
		short: 'Storing all tenants in shared databases and tables, told apart by a tenant ID in every row.',
		explanation:
			'Cheap and simple to run and to onboard new tenants, but an outage or a heavy tenant affects everyone.',
		readMore: sharding('dedicated-or-shared-storage-per-tenant', 'Dedicated or shared storage per tenant'),
	},
	{
		id: 'bridge-model',
		term: 'Bridge model',
		aliases: ['bridge model', 'Bridge model'],
		short: 'Giving each tenant its own database schema or tables inside a shared database.',
		explanation:
			'A middle ground between the pool and the silo models: some separation per tenant at a lower cost than a database each.',
		readMore: sharding('dedicated-or-shared-storage-per-tenant', 'Dedicated or shared storage per tenant'),
	},
	{
		id: 'silo-model',
		term: 'Silo model',
		aliases: ['silo model', 'Silo model', 'silo', 'silos', 'siloed'],
		short: 'Giving each tenant a database of its own.',
		explanation:
			'It keeps one tenant\'s load and failures away from the others and allows per-tenant backup, restore, and data residency, at the cost of many databases to run.',
		readMore: sharding('dedicated-or-shared-storage-per-tenant', 'Dedicated or shared storage per tenant'),
	},
	{
		id: 'noisy-neighbor',
		term: 'Noisy neighbor',
		aliases: ['noisy neighbor', 'noisy neighbors', 'Noisy neighbor', 'Noisy neighbors'],
		short: 'A tenant whose heavy load slows other tenants that share its resources.',
		explanation:
			'Per-tenant limits, a dedicated shard, or a silo keep one tenant from degrading the rest.',
		readMore: sharding('dedicated-or-shared-storage-per-tenant', 'Dedicated or shared storage per tenant'),
	},
	{
		id: 'cell',
		term: 'Cell',
		aliases: ['cells', 'Cells', 'cell-based architecture', 'Cell-based architecture'],
		short: 'An independent copy of the whole stack that serves a subset of customers.',
		explanation:
			'A failure or a bad deploy stays inside one cell. A thin router sends each customer to its cell.',
		readMore: { href: 'https://docs.aws.amazon.com/wellarchitected/latest/reducing-scope-of-impact-with-cell-based-architecture/what-is-a-cell-based-architecture.html', label: 'AWS: What is a cell-based architecture' },
	},
	{
		id: 'database-schema',
		term: 'Database schema',
		aliases: ['database schema', 'database schemas', 'Database schema'],
		short: 'A named group of tables inside one database, such as a schema in PostgreSQL.',
		explanation:
			'Tables in different schemas can share a name, so each tenant or service can get its own set of tables in one database.',
		readMore: { href: 'https://www.postgresql.org/docs/current/ddl-schemas.html', label: 'PostgreSQL docs: Schemas' },
	},
	{
		id: 'hot-key',
		term: 'Hot key',
		aliases: ['hot key', 'hot keys', 'Hot key', 'Hot keys'],
		short: 'One key value that gets more traffic than a whole shard can serve.',
		explanation:
			'Adding or moving shards does not help, since the key lives on one shard. Cache it for reads, or salt it for writes.',
		readMore: sharding('one-key-with-too-much-traffic', 'One key with too much traffic'),
	},
	{
		id: 'salting',
		term: 'Salting',
		aliases: ['salting', 'Salting', 'salted key', 'salted keys'],
		short: 'Adding a suffix to a hot key so that its writes spread over many keys and shards.',
		explanation:
			'Reading all the data of the original key then means reading every suffix and merging the results.',
		readMore: sharding('one-key-with-too-much-traffic', 'One key with too much traffic'),
	},
	{
		id: 'scatter-gather',
		term: 'Scatter-gather',
		aliases: ['scatter-gather', 'Scatter-gather'],
		short: 'Sending a query to every shard and merging the results.',
		explanation:
			'Every shard does the work, and the slowest shard sets the latency, so keep such queries rare.',
		readMore: sharding('querying-without-the-shard-key', 'Querying without the shard key'),
	},
	{
		id: 'local-index',
		term: 'Local index',
		aliases: ['local index', 'local indexes', 'Local index'],
		short: 'A secondary index on each shard that covers only that shard\'s rows.',
		explanation:
			'A write updates one shard. A query without the shard key has to ask every shard.',
		readMore: sharding('finding-records-by-another-field', 'Finding records by another field'),
	},
	{
		id: 'global-index',
		term: 'Global index',
		aliases: ['global index', 'global indexes', 'Global index', 'global secondary index', 'global secondary indexes'],
		short: 'A secondary index over all shards, itself sharded by the indexed value.',
		explanation:
			'A lookup reads one index shard. Every write also touches the index shard, so the index either slows writes or lags behind them.',
		readMore: sharding('finding-records-by-another-field', 'Finding records by another field'),
	},
	{
		id: 'distributed-transaction',
		term: 'Distributed transaction',
		aliases: ['distributed transaction', 'distributed transactions', 'Distributed transaction', 'Distributed transactions'],
		short: 'A transaction that changes data on several nodes and commits on all of them or on none.',
		explanation:
			'It needs a protocol such as two-phase commit, which adds round trips and holds locks across them.',
		readMore: consistency('committing-on-several-nodes', 'Committing on several nodes'),
	},
	{
		id: 'two-phase-commit',
		term: 'Two-phase commit',
		aliases: ['two-phase commit', 'Two-phase commit', '2PC'],
		short: 'A protocol in which participants first prepare a change and vote, then all commit if every vote is yes, or all abort.',
		explanation:
			'A prepared participant must follow the final decision, so a failed coordinator leaves it waiting with changes locked. It gives atomicity, not isolation.',
		readMore: consistency('committing-on-several-nodes', 'Committing on several nodes'),
	},
	{
		id: 'saga',
		term: 'Saga',
		aliases: ['saga', 'sagas', 'Saga', 'Sagas'],
		short: 'A chain of local transactions in which steps that may need undoing have compensating steps.',
		explanation:
			'No locks span services or shards, and other requests can see the state between steps. It finishes only if its retries and compensations do.',
		readMore: consistency('steps-that-cannot-be-rolled-back', 'Steps that cannot be rolled back'),
	},
	{
		id: 'composite-key',
		term: 'Composite key',
		aliases: ['composite key', 'composite keys', 'Composite key', 'compound key', 'compound keys'],
		short: 'A key made of several columns, such as (workspace_id, id).',
		explanation:
			'An index on it sorts rows by the first column, then by the next. In a sharded table, the shard key comes first, and the rest sorts the rows inside the shard.',
		readMore: { href: 'https://en.wikipedia.org/wiki/Composite_key', label: 'Wikipedia: Composite key' },
	},
	{
		id: 'murmurhash',
		term: 'MurmurHash',
		aliases: ['MurmurHash', 'MurmurHash3'],
		short: 'A fast hash function that is not meant for security.',
		explanation:
			'It gives the same result on every machine and spreads similar inputs evenly, so databases such as Cassandra use it to place keys.',
		readMore: { href: 'https://en.wikipedia.org/wiki/MurmurHash', label: 'Wikipedia: MurmurHash' },
	},
	{
		id: 'md5',
		term: 'MD5',
		aliases: ['MD5'],
		short: 'A 128-bit hash function, broken for security but still used to spread keys.',
		explanation:
			'Its output is the same on every machine, so a database can place keys with it. Do not use it for passwords or signatures.',
		readMore: { href: 'https://en.wikipedia.org/wiki/MD5', label: 'Wikipedia: MD5' },
	},
	{
		id: 'hedged-request',
		term: 'Hedged request',
		aliases: ['hedged request', 'hedged requests', 'Hedged request', 'Hedged requests'],
		short: 'A second copy of a slow request, sent to another replica; the first answer wins.',
		explanation:
			'It cuts tail latency for a small share of extra load, because the second copy goes out only after a short wait.',
		readMore: { href: 'https://www.barroso.org/publications/TheTailAtScale.pdf', label: 'Dean, Barroso: The Tail at Scale' },
	},
	{
		id: 'cache',
		term: 'Cache',
		aliases: ['cache', 'caches', 'Cache', 'Caches'],
		short: 'A copy of data or results that is faster to read than the original and can be rebuilt from it.',
		explanation:
			'It cuts latency and load on the source while it answers most reads. Losing it makes a system slower but not wrong.',
		readMore: caching('when-a-cache-pays-off', 'When a cache pays off'),
	},
	{
		id: 'hit-ratio',
		term: 'Hit ratio',
		aliases: ['hit ratio', 'Hit ratio', 'hit rate', 'Hit rate'],
		short: 'The share of requests a cache answers without going to the source.',
		explanation:
			'It sets how much load and latency a cache removes. It depends on the number of keys, the memory, and how often values change.',
		readMore: caching('when-a-cache-pays-off', 'When a cache pays off'),
	},
	{
		id: 'five-minute-rule',
		term: 'Five-minute rule',
		aliases: ['five-minute rule', 'Five-minute rule'],
		short: 'A cost rule: data read again within a break-even interval is cheaper to keep in memory than on disk.',
		explanation:
			'The interval comes from the price of RAM and the price of disk reads. A 2019 study found about five minutes for 4 KB pages in front of SATA SSDs.',
		readMore: caching('when-a-cache-pays-off', 'When a cache pays off'),
	},
	{
		id: 'remote-cache',
		term: 'Remote cache',
		aliases: ['remote cache', 'remote caches', 'Remote cache'],
		short: 'A cache on its own servers that all app servers use over the network.',
		explanation:
			'The app servers share one copy of each value and can delete it in one place. Each read costs a network round trip.',
		readMore: caching('putting-a-cache-in-front-of-the-database', 'Putting a cache in front of the database'),
	},
	{
		id: 'cache-aside',
		term: 'Cache-aside',
		aliases: ['cache-aside', 'Cache-aside'],
		short: 'A caching pattern where the app reads the cache, loads a miss from the source, and stores it.',
		explanation:
			'Only values that are read get cached, and the app can bypass a failed cache if it limits the load on the source. Every read path must handle the miss.',
		readMore: caching('putting-a-cache-in-front-of-the-database', 'Putting a cache in front of the database'),
	},
	{
		id: 'read-through',
		term: 'Read-through',
		aliases: ['read-through', 'Read-through'],
		short: 'A caching pattern where the cache itself loads a missing value from the source.',
		explanation:
			'The miss logic lives in one place. The cache must know the source, and the app needs a planned way to the data when the cache is down.',
		readMore: caching('putting-a-cache-in-front-of-the-database', 'Putting a cache in front of the database'),
	},
	{
		id: 'cache-invalidation',
		term: 'Invalidation',
		aliases: ['invalidation', 'Invalidation', 'cache invalidation', 'Cache invalidation'],
		short: 'Removing a cached copy because the original changed.',
		explanation:
			'The usual way is to delete the key after the write commits, so the next read loads the new value. Keep a TTL as well, since a delete can lose a race.',
		readMore: caching('updating-the-cache-when-data-changes', 'Updating the cache when data changes'),
	},
	{
		id: 'write-through',
		term: 'Write-through',
		aliases: ['write-through', 'Write-through'],
		short: 'A caching pattern where each write updates the source and the cache before it returns.',
		explanation:
			'A read right after a write is likely to hit. Every write pays a second step, the cache fills with values that may never be read, and failed or reordered updates still need a TTL.',
		readMore: caching('updating-the-cache-when-data-changes', 'Updating the cache when data changes'),
	},
	{
		id: 'write-around',
		term: 'Write-around',
		aliases: ['write-around', 'Write-around'],
		short: 'A caching pattern where writes go only to the source and the cache fills on the next miss.',
		explanation:
			'It keeps unread values out of the cache. Pair it with a delete of the key, or readers see the old value until its TTL ends.',
		readMore: caching('updating-the-cache-when-data-changes', 'Updating the cache when data changes'),
	},
	{
		id: 'working-set',
		term: 'Working set',
		aliases: ['working set', 'Working set', 'working sets'],
		short: 'The data a system reads within a period, often a small part of all its data.',
		explanation: 'Size a cache for the working set, not for the whole data. When it does not fit, the hit ratio falls.',
		readMore: caching('choosing-what-to-drop-when-memory-is-full', 'Choosing what to drop when memory is full'),
	},
	{
		id: 'eviction',
		term: 'Eviction',
		aliases: ['eviction', 'evictions', 'Eviction', 'evict', 'evicted'],
		short: 'Dropping a value from a full cache to make room for another.',
		explanation:
			'A policy such as LRU or LFU picks the value, whether or not the source changed. The next read of it misses.',
		readMore: caching('choosing-what-to-drop-when-memory-is-full', 'Choosing what to drop when memory is full'),
	},
	{
		id: 'lru',
		term: 'LRU',
		expansion: 'Least Recently Used',
		short: 'An eviction policy that drops the value read longest ago.',
		explanation: 'It is the usual default for caches. A single pass over cold data can push out the hot values.',
		readMore: caching('choosing-what-to-drop-when-memory-is-full', 'Choosing what to drop when memory is full'),
	},
	{
		id: 'lfu',
		term: 'LFU',
		expansion: 'Least Frequently Used',
		short: 'An eviction policy that drops the value read least often.',
		explanation: 'It keeps steady favorites through a scan. Its counts must decay, or values popular yesterday stay too long.',
		readMore: caching('choosing-what-to-drop-when-memory-is-full', 'Choosing what to drop when memory is full'),
	},
	{
		id: 'fifo',
		term: 'FIFO',
		expansion: 'First In, First Out',
		short: 'An order where the item that came first leaves first; as an eviction policy, it drops the value stored first.',
		explanation: 'It needs less bookkeeping per read than LRU. In trace simulations it often missed about as often as LRU.',
		readMore: caching('choosing-what-to-drop-when-memory-is-full', 'Choosing what to drop when memory is full'),
	},
	{
		id: 'clock-eviction',
		term: 'CLOCK',
		aliases: ['CLOCK'],
		short: 'An eviction policy that goes around the values in a circle and spares a value read since its last visit.',
		explanation: 'It behaves close to LRU with less bookkeeping per read. Databases often use it for their page caches.',
		readMore: caching('choosing-what-to-drop-when-memory-is-full', 'Choosing what to drop when memory is full'),
	},
	{
		id: 'tinylfu',
		term: 'TinyLFU',
		aliases: ['TinyLFU', 'W-TinyLFU'],
		short: 'A cache admission policy that lets a new value in only if it is read more often than the value it would replace.',
		explanation: 'It keeps an approximate count of recent reads per key. One-off reads, such as a scan, mostly stay out.',
		readMore: caching('choosing-what-to-drop-when-memory-is-full', 'Choosing what to drop when memory is full'),
	},
	{
		id: 'write-behind',
		term: 'Write-behind',
		aliases: ['write-behind', 'Write-behind', 'write-back', 'Write-back'],
		short: 'A caching pattern where writes go to the cache and reach the source later, in batches.',
		explanation:
			'It turns many small writes into a few large ones. Writes not yet flushed are lost if the cache fails, so the cache becomes a store.',
		readMore: caching('too-many-small-writes', 'Too many small writes'),
	},
	{
		id: 'private-cache',
		term: 'Private cache',
		aliases: ['private cache', 'private caches', 'Private cache'],
		short: 'An HTTP cache that serves one user, such as a browser.',
		explanation: 'It may keep personal responses. The server cannot remove a response from it before its lifetime ends.',
		readMore: caching('caching-responses-outside-your-servers', 'Caching responses outside your servers'),
	},
	{
		id: 'shared-cache',
		term: 'Shared cache',
		aliases: ['shared cache', 'shared caches', 'Shared cache'],
		short: 'An HTTP cache that serves many users, such as a CDN or a reverse proxy.',
		explanation:
			'One stored response answers many readers. It must never store a personal response, so mark those private.',
		readMore: caching('caching-responses-outside-your-servers', 'Caching responses outside your servers'),
	},
	{
		id: 'revalidation',
		term: 'Revalidation',
		aliases: ['revalidation', 'Revalidation', 'revalidate', 'revalidates'],
		short: 'Asking the server whether a stored response is still current instead of downloading it again.',
		explanation:
			'The cache sends the ETag or Last-Modified value back. If nothing changed, the server answers 304 Not Modified with no body.',
		readMore: caching('checking-whether-a-copy-is-still-current', 'Checking whether a copy is still current'),
	},
	{
		id: 'local-cache',
		term: 'Local cache',
		aliases: ['local cache', 'local caches', 'Local cache', 'in-process cache'],
		short: 'A cache in the memory of each app server.',
		explanation:
			'Reads skip the network, which takes load off a hot key. Each server holds its own copy; the TTL limits local reuse, and the remote copy may already be old.',
		readMore: caching('one-key-too-hot-for-one-cache-node', 'One key too hot for one cache node'),
	},
	{
		id: 'cache-stampede',
		term: 'Cache stampede',
		aliases: ['cache stampede', 'cache stampedes', 'Cache stampede'],
		short: 'Many requests missing on the same key at once and all loading it from the source.',
		explanation:
			'It happens when a hot key expires or is deleted. Allow one load per key and serve the old value while it runs.',
		readMore: caching('many-misses-at-once', 'Many misses at once'),
	},
	{
		id: 'request-coalescing',
		term: 'Request coalescing',
		aliases: ['request coalescing', 'Request coalescing', 'single flight'],
		short: 'Letting one request load a missing value while others asking for it wait for the result.',
		explanation: 'It turns many identical loads into one. Done per server, it leaves one load per server.',
		readMore: caching('many-misses-at-once', 'Many misses at once'),
	},
	{
		id: 'probabilistic-early-refresh',
		term: 'Probabilistic early refresh',
		aliases: ['probabilistic early refresh', 'Probabilistic early refresh', 'probabilistic early expiration'],
		short: 'Refreshing a cached value before it expires, with a chance that grows near the expiry.',
		explanation:
			'Reads rarely refresh at the same moment, so a stampede shrinks to a few loads without a lock. It does not help after a delete.',
		readMore: caching('many-misses-at-once', 'Many misses at once'),
	},
	{
		id: 'negative-caching',
		term: 'Negative caching',
		aliases: ['negative caching', 'Negative caching'],
		short: 'Caching the fact that a value does not exist, or that a call failed.',
		explanation:
			'Repeated requests for missing data or a failing call stop reaching the source. Give such entries a short TTL, and never share an error that depends on the user.',
		readMore: caching('requests-for-data-that-does-not-exist', 'Requests for data that does not exist'),
	},
	{
		id: 'redis',
		term: 'Redis',
		aliases: ['Redis'],
		short: 'An in-memory server that stores data structures under keys and runs commands on them.',
		explanation:
			'A small command takes far less time than the network round trip, so it often sits next to a database for caches, sessions, counters, and queues. Its copies are asynchronous, so a crash or failover can lose recent writes.',
		readMore: redis('taking-hot-data-off-the-database', 'Taking hot data off the database'),
	},
	{
		id: 'valkey',
		term: 'Valkey',
		aliases: ['Valkey'],
		short: 'An open-source fork of Redis 7.2.4, run by the Linux Foundation under the BSD license.',
		explanation:
			'It keeps the protocol and core features of Redis, so most clients work with both. Newer features of the two differ.',
		readMore: redis('taking-hot-data-off-the-database', 'Taking hot data off the database'),
	},
	{
		id: 'pipelining',
		term: 'Pipelining',
		aliases: ['Pipelining', 'pipelining'],
		short: 'Sending many commands without waiting for each reply, then reading all replies together.',
		explanation:
			'It pays one network round trip for many commands and saves system calls on the server. It is not a transaction: other clients\' commands can run in between.',
		readMore: redis('paying-for-round-trips', 'Paying for round trips'),
	},
	{
		id: 'multi-exec',
		term: 'MULTI and EXEC',
		aliases: ['MULTI and EXEC'],
		short: 'Redis commands that queue a group of commands and run them in a row, with no other client in between.',
		explanation:
			'There is no rollback: a command that fails at run time fails alone. The client gets the results only after EXEC, so it cannot use one to decide what to queue next.',
		readMore: redis('changing-several-values-as-one-step', 'Changing several values as one step'),
	},
	{
		id: 'lua-script',
		term: 'Lua script',
		aliases: ['Lua script', 'Lua scripts'],
		short: 'A small program that Redis runs on the server as one command, with no other command in between.',
		explanation:
			'It can read, decide, and write in one round trip. While it runs, every other client waits, and an error does not undo the writes it already made.',
		readMore: redis('changing-several-values-as-one-step', 'Changing several values as one step'),
	},
	{
		id: 'redis-function',
		term: 'Redis function',
		aliases: ['Redis functions', 'Redis function'],
		short: 'A named script that Redis stores and copies to replicas together with the data.',
		explanation:
			'Unlike scripts sent with EVAL, functions survive restarts and failovers, so clients do not have to load them again.',
		readMore: redis('changing-several-values-as-one-step', 'Changing several values as one step'),
	},
	{
		id: 'hyperloglog',
		term: 'HyperLogLog',
		aliases: ['HyperLogLog'],
		short: 'A structure that estimates how many distinct items it has seen, in a small fixed amount of memory.',
		explanation:
			'In Redis it takes at most 12 KB per key with a standard error of 0.81%. Estimates of several periods can be merged without counting a repeat visitor twice.',
		readMore: redis('counting-and-ranking', 'Counting and ranking'),
	},
	{
		id: 'pub-sub',
		term: 'Pub/Sub',
		aliases: ['Pub/Sub', 'pub/sub'],
		short: 'Messaging where a sender publishes to a channel and every subscriber of the channel receives the message.',
		explanation:
			'Some systems keep the messages for subscribers that are away. Redis Pub/Sub keeps nothing, so a subscriber that is away or too slow loses them.',
		readMore: redis('pushing-events-to-connected-servers', 'Pushing events to connected servers'),
	},
	{
		id: 'sharded-pub-sub',
		term: 'Sharded Pub/Sub',
		aliases: ['Sharded Pub/Sub', 'sharded Pub/Sub'],
		short: 'Pub/Sub in Redis Cluster where each channel belongs to one shard, like a key.',
		explanation:
			'Messages stay inside one shard instead of going to every node, so more shards mean more capacity.',
		readMore: redis('pushing-events-to-connected-servers', 'Pushing events to connected servers'),
	},
	{
		id: 'redis-stream',
		term: 'Redis stream',
		aliases: ['Redis stream', 'Redis streams'],
		short: 'An append-only log of entries stored under one Redis key.',
		explanation:
			'Consumer groups share its entries among workers with acknowledgments and redelivery. It lives on one server and in its memory.',
		readMore: redis('handing-out-work-that-survives-a-worker-crash', 'Handing out work that survives a worker crash'),
	},
	{
		id: 'consumer-group',
		term: 'Consumer group',
		aliases: ['consumer group', 'consumer groups', 'Consumer group', 'Consumer groups'],
		short: 'A set of workers that share the entries of a log, each entry going to one of them.',
		explanation:
			'The group keeps its position in the log. In Redis it also keeps the entries delivered but not yet confirmed, so the work of a failed worker can go to another.',
		readMore: redis('handing-out-work-that-survives-a-worker-crash', 'Handing out work that survives a worker crash'),
	},
	{
		id: 'rdb-snapshot',
		term: 'RDB snapshot',
		aliases: ['RDB snapshot', 'RDB snapshots'],
		expansion: 'Redis Database snapshot',
		short: 'A Redis file with the whole dataset at one moment.',
		explanation:
			'BGSAVE writes it from a forked child process, SAVE in the main process, which blocks clients. It is compact and loads fast, a good backup; a crash loses everything written since the last one.',
		readMore: redis('writing-data-to-disk', 'Writing data to disk'),
	},
	{
		id: 'aof',
		term: 'AOF',
		aliases: ['AOF'],
		expansion: 'Append-only file',
		short: 'Redis\'s log of write commands, replayed on restart.',
		explanation:
			'Flushed once a second, it loses about a second of writes in a crash; flushed on every write, it loses none but is much slower. It is off by default.',
		readMore: redis('writing-data-to-disk', 'Writing data to disk'),
	},
	{
		id: 'sentinel',
		term: 'Redis Sentinel',
		aliases: ['Sentinel', 'Sentinels'],
		short: 'Processes that watch a Redis primary and promote a replica when it fails.',
		explanation:
			'Run at least three on separate machines. A failover needs a majority of them and can still lose recent writes.',
		readMore: redis('replacing-a-failed-primary', 'Replacing a failed primary'),
	},
	{
		id: 'redis-cluster',
		term: 'Redis Cluster',
		aliases: ['Redis Cluster'],
		short: 'Redis\'s built-in sharding: keys map to 16,384 hash slots spread over several primaries.',
		explanation:
			'Clients send each command straight to the owner of the key\'s slot. Commands on several keys work only within one slot.',
		readMore: redis('spreading-data-over-many-servers', 'Spreading data over many servers'),
	},
	{
		id: 'hash-tag',
		term: 'Hash tag',
		aliases: ['hash tag', 'hash tags', 'Hash tag'],
		short: 'The part of a Redis key in braces that alone decides the key\'s hash slot.',
		explanation:
			'Keys with the same tag land on the same server, so one command or script can use them together. A busy tag becomes a hot spot.',
		readMore: redis('spreading-data-over-many-servers', 'Spreading data over many servers'),
	},
	{
		id: 'client-side-caching',
		term: 'Client-side caching',
		aliases: ['client-side caching', 'Client-side caching'],
		short: 'Keeping copies of server data in the client\'s memory, with the server telling the client when a copy changes.',
		explanation:
			'It takes reads of hot keys off the server. The client must drop its copies when it loses the connection.',
		readMore: redis('one-key-hotter-than-the-rest', 'One key hotter than the rest'),
	},
	{
		id: 'postmaster',
		term: 'Postmaster',
		aliases: ['postmaster', 'Postmaster'],
		short: 'The main PostgreSQL process that accepts connections and starts a process for each one.',
		explanation:
			'When a backend crashes, it ends the other backends and recovers the database from its log, which interrupts every client.',
		readMore: postgresql('serving-many-clients-from-one-server', 'Serving many clients from one server'),
	},
	{
		id: 'pg-backend',
		term: 'Backend (PostgreSQL)',
		aliases: ['backend process', 'backend processes'],
		short: 'A PostgreSQL server process that serves one client connection.',
		explanation:
			'Each connection costs a whole process, which is why apps reuse connections through pools.',
		readMore: postgresql('serving-many-clients-from-one-server', 'Serving many clients from one server'),
	},
	{
		id: 'shared-buffers',
		term: 'Shared buffers',
		aliases: ['shared buffers', 'Shared buffers', 'shared_buffers'],
		short: 'The page cache that all PostgreSQL processes share in memory.',
		explanation:
			'Pages are read and changed here and written to the data files later. A common start is a quarter of RAM; the OS page cache holds more.',
		readMore: postgresql('serving-many-clients-from-one-server', 'Serving many clients from one server'),
	},
	{
		id: 'pg-instance',
		term: 'Instance (PostgreSQL)',
		aliases: ['PostgreSQL instance', 'database cluster'],
		short: 'One PostgreSQL server: a main process with its memory and data directory, holding one or more databases.',
		explanation:
			'Its databases share memory, processes, and one WAL, so standbys and physical backups copy all of them together.',
		readMore: postgresql('serving-many-clients-from-one-server', 'Serving many clients from one server'),
	},
	{
		id: 'torn-page',
		term: 'Torn page',
		aliases: ['torn page', 'torn pages', 'Torn page'],
		short: 'A page that a crash left half old and half new, because the disk wrote only part of it.',
		explanation:
			'PostgreSQL writes a full copy of each page to the WAL on its first change after a checkpoint, so recovery can repair a torn page.',
		readMore: postgresql('deciding-when-a-commit-is-durable', 'Deciding when a commit is durable'),
	},
	{
		id: 'asynchronous-commit',
		term: 'Asynchronous commit',
		aliases: ['asynchronous commit', 'Asynchronous commit'],
		short: 'A commit that returns before its log record is flushed to disk.',
		explanation:
			'It cuts commit latency; a crash can lose the most recent acknowledged commits, within the WAL writer\'s flush window, but leaves the data consistent.',
		readMore: postgresql('deciding-when-a-commit-is-durable', 'Deciding when a commit is durable'),
	},
	{
		id: 'data-checksums',
		term: 'Data checksums',
		aliases: ['data checksums', 'Data checksums'],
		short: 'A checksum stored in every data page so that the database detects a damaged page when it reads it.',
		explanation:
			'They catch corruption from disks or memory instead of returning wrong data. PostgreSQL 18 turns them on by default for new instances.',
		readMore: postgresql('deciding-when-a-commit-is-durable', 'Deciding when a commit is durable'),
	},
	{
		id: 'range-type',
		term: 'Range type',
		aliases: ['range type', 'range types', 'Range type'],
		short: 'A column type that holds a period or interval, such as a range of dates, as one value.',
		explanation:
			'The database can then compare ranges directly, for example check whether two bookings overlap.',
		readMore: postgresql('keeping-data-valid-inside-the-database', 'Keeping data valid inside the database'),
	},
	{
		id: 'exclusion-constraint',
		term: 'Exclusion constraint',
		aliases: ['exclusion constraint', 'exclusion constraints', 'Exclusion constraint'],
		short: 'A table rule that rejects a row conflicting with an existing row under chosen operators, such as overlapping dates for the same item.',
		explanation:
			'It stops double bookings inside the database, without races between app servers.',
		readMore: postgresql('keeping-data-valid-inside-the-database', 'Keeping data valid inside the database'),
	},
	{
		id: 'db-sequence',
		term: 'Sequence (database)',
		aliases: ['database sequence'],
		short: 'A database object that generates a series of numbers, commonly for IDs.',
		explanation:
			'A rollback does not return a number, so gaps are normal; uniqueness comes from a key, not from the sequence.',
		readMore: postgresql('keeping-data-valid-inside-the-database', 'Keeping data valid inside the database'),
	},
	{
		id: 'jsonb',
		term: 'JSONB',
		aliases: ['JSONB'],
		short: 'A PostgreSQL column type that stores JSON in a parsed binary form that can be queried and indexed.',
		explanation:
			'It suits attributes that differ from record to record, next to typed columns for the core fields.',
		readMore: postgresql('storing-attributes-that-differ-per-record', 'Storing attributes that differ per record'),
	},
	{
		id: 'generated-column',
		term: 'Generated column',
		aliases: ['generated column', 'generated columns'],
		short: 'A column whose value the database computes from other columns of the same row.',
		explanation:
			'A stored one is computed on every insert and update and kept like a normal column, so it can be indexed and constrained.',
		readMore: postgresql('storing-attributes-that-differ-per-record', 'Storing attributes that differ per record'),
	},
	{
		id: 'gin',
		term: 'GIN',
		aliases: ['GIN'],
		expansion: 'Generalized inverted index',
		short: 'An index that maps each element of a value, such as a word or a JSON key, to the rows that contain it.',
		explanation:
			'It answers "contains" queries on documents, arrays, and text, and makes writes slower.',
		readMore: postgresql('storing-attributes-that-differ-per-record', 'Storing attributes that differ per record'),
	},
	{
		id: 'gist',
		term: 'GiST',
		aliases: ['GiST'],
		expansion: 'Generalized search tree',
		short: 'A PostgreSQL index for values that overlap or lie near each other, such as ranges, shapes, and points.',
		explanation:
			'It answers "overlaps" and "nearest" queries and enforces exclusion constraints.',
		readMore: postgresql('choosing-an-index-for-a-query', 'Choosing an index for a query'),
	},
	{
		id: 'brin',
		term: 'BRIN',
		aliases: ['BRIN'],
		expansion: 'Block range index',
		short: 'A tiny index that stores a summary of each range of table pages, such as the lowest and highest value.',
		explanation:
			'It fits huge tables whose rows are stored in the order of the indexed value, such as time.',
		readMore: postgresql('choosing-an-index-for-a-query', 'Choosing an index for a query'),
	},
	{
		id: 'heap-table',
		term: 'Heap (table)',
		aliases: ['heap table', 'heap tables'],
		short: 'A table stored as pages of rows in no particular order.',
		explanation:
			'PostgreSQL B-tree indexes point to a row\'s place in the heap, so an update that is not HOT needs new index entries.',
		readMore: postgresql('storing-rows-and-pointing-to-them', 'Storing rows and pointing to them'),
	},
	{
		id: 'tid',
		term: 'TID',
		aliases: ['TID', 'TIDs'],
		expansion: 'Tuple identifier',
		short: 'The address of a row in a PostgreSQL table: a page number and a slot on that page.',
		explanation:
			'B-tree indexes map their keys to TIDs. A TID changes when the row is updated, so it is not an ID for the app.',
		readMore: postgresql('storing-rows-and-pointing-to-them', 'Storing rows and pointing to them'),
	},
	{
		id: 'toast',
		term: 'TOAST',
		aliases: ['TOAST'],
		expansion: 'The oversized-attribute storage technique',
		short: 'The way PostgreSQL compresses long values of a wide row and may move them to a separate table.',
		explanation:
			'It starts when a row is wider than about 2 KB. A query that does not ask for a moved value never fetches it.',
		readMore: postgresql('storing-rows-and-pointing-to-them', 'Storing rows and pointing to them'),
	},
	{
		id: 'partial-index',
		term: 'Partial index',
		aliases: ['partial index', 'partial indexes', 'Partial index'],
		short: 'An index over only the rows that match a condition.',
		explanation:
			'It is smaller and cheaper to update. The planner uses it only when it can prove from the query that the rows match its condition.',
		readMore: postgresql('choosing-an-index-for-a-query', 'Choosing an index for a query'),
	},
	{
		id: 'expression-index',
		term: 'Expression index',
		aliases: ['expression index', 'expression indexes', 'Expression index'],
		short: 'An index on the result of a function or expression over columns, such as lower(email).',
		explanation:
			'A query uses it only when it contains the same expression.',
		readMore: postgresql('choosing-an-index-for-a-query', 'Choosing an index for a query'),
	},
	{
		id: 'index-only-scan',
		term: 'Index-only scan',
		aliases: ['index-only scan', 'index-only scans', 'Index-only scan'],
		short: 'A read that answers a query from an index, visiting the table only for pages not known to be visible to everyone.',
		explanation:
			'It needs every requested column in the index; vacuuming keeps the map of all-visible pages current.',
		readMore: postgresql('choosing-an-index-for-a-query', 'Choosing an index for a query'),
	},
	{
		id: 'pg-stat-statements',
		term: 'pg_stat_statements',
		aliases: ['pg_stat_statements'],
		short: 'A PostgreSQL extension that counts calls, total time, and pages read for each kind of query.',
		explanation:
			'Sorting by total time shows which queries cost the database the most.',
		readMore: postgresql('finding-why-a-query-is-slow', 'Finding why a query is slow'),
	},
	{
		id: 'query-planner',
		term: 'Query planner',
		aliases: ['query planner', 'Query planner', 'planner'],
		short: 'The part of a database that chooses how to run a query by its estimated cost.',
		explanation:
			'Its estimates come from statistics about the data, so a wrong estimate can lead to a slow plan.',
		readMore: postgresql('finding-why-a-query-is-slow', 'Finding why a query is slow'),
	},
	{
		id: 'nested-loop',
		term: 'Nested loop',
		aliases: ['nested loop', 'Nested loop'],
		short: 'A join that runs its inner side once for each row of its outer side.',
		explanation:
			'It is often fast when the outer side is small and the inner side is an index lookup.',
		readMore: postgresql('finding-why-a-query-is-slow', 'Finding why a query is slow'),
	},
	{
		id: 'hash-join',
		term: 'Hash join',
		aliases: ['hash join', 'hash joins', 'Hash join'],
		short: 'A join that builds a hash table from one input in memory and probes it with the other.',
		explanation:
			'It is often useful for large inputs joined by equality.',
		readMore: postgresql('finding-why-a-query-is-slow', 'Finding why a query is slow'),
	},
	{
		id: 'merge-join',
		term: 'Merge join',
		aliases: ['merge join', 'Merge join'],
		short: 'A join that walks two inputs sorted by the join key side by side.',
		explanation:
			'It is often useful when both inputs already come sorted.',
		readMore: postgresql('finding-why-a-query-is-slow', 'Finding why a query is slow'),
	},
	{
		id: 'connection-pooler',
		term: 'Connection pooler',
		aliases: ['connection pooler', 'connection poolers', 'pooler', 'Connection pooler'],
		short: 'A proxy between apps and a database that shares a few database connections among many clients.',
		explanation:
			'PgBouncer is the common one for PostgreSQL. It keeps the number of server connections small while apps open as many as they like.',
		readMore: postgresql('serving-thousands-of-app-connections', 'Serving thousands of app connections'),
	},
	{
		id: 'transaction-mode',
		term: 'Transaction mode',
		aliases: ['transaction mode', 'Transaction mode'],
		short: 'A pooler mode that lends a client a server connection only for one transaction.',
		explanation:
			'A few dozen server connections can serve thousands of clients, but session state such as SET or LISTEN does not survive between transactions.',
		readMore: postgresql('serving-thousands-of-app-connections', 'Serving thousands of app connections'),
	},
	{
		id: 'hot-update',
		term: 'HOT update',
		aliases: ['HOT update', 'HOT updates'],
		expansion: 'Heap-only tuple update',
		short: 'A PostgreSQL update that adds no entries to indexes that point to rows: no column they use changes, and the new version fits on the same page.',
		explanation:
			'Keeping updates HOT saves index writes and WAL. Since PostgreSQL 16, a BRIN index does not prevent it.',
		readMore: postgresql('an-update-writes-a-new-row', 'An update writes a new row'),
	},
	{
		id: 'vacuum',
		term: 'VACUUM',
		aliases: ['VACUUM', 'vacuuming', 'Vacuuming'],
		short: 'The PostgreSQL process that removes row versions no transaction can see and makes their space reusable.',
		explanation:
			'It runs next to normal work and rarely shrinks files. It also freezes old rows against transaction ID wraparound.',
		readMore: postgresql('dead-rows-pile-up', 'Dead rows pile up'),
	},
	{
		id: 'autovacuum',
		term: 'Autovacuum',
		aliases: ['autovacuum', 'Autovacuum'],
		short: 'The PostgreSQL background workers that vacuum and analyze tables when enough rows change.',
		explanation:
			'Its defaults wait too long for large tables, so busy tables need lower thresholds.',
		readMore: postgresql('dead-rows-pile-up', 'Dead rows pile up'),
	},
	{
		id: 'bloat',
		term: 'Bloat',
		aliases: ['bloat', 'Bloat'],
		short: 'Space in tables and indexes taken by dead rows or left empty after they were removed.',
		explanation:
			'Some is normal. Growing bloat makes queries read more pages; fix what blocks cleanup, and rebuild when the waste stays large.',
		readMore: postgresql('dead-rows-pile-up', 'Dead rows pile up'),
	},
	{
		id: 'transaction-id',
		term: 'Transaction ID',
		aliases: ['transaction ID', 'transaction IDs', 'Transaction ID', 'XID', 'XIDs'],
		short: 'A number a database gives each transaction that writes, in increasing order.',
		explanation:
			'In PostgreSQL it has 32 bits and wraps around, so vacuuming must freeze old rows before it runs out.',
		readMore: postgresql('running-out-of-transaction-ids', 'Running out of transaction IDs'),
	},
	{
		id: 'freezing',
		term: 'Freezing',
		aliases: ['freezing', 'Freezing'],
		short: 'Marking old rows as visible to every transaction, so their transaction IDs can be used again.',
		explanation:
			'PostgreSQL vacuuming does it; if it falls behind, the database stops taking writes.',
		readMore: postgresql('running-out-of-transaction-ids', 'Running out of transaction IDs'),
	},
	{
		id: 'advisory-lock',
		term: 'Advisory lock',
		aliases: ['advisory lock', 'advisory locks', 'Advisory lock'],
		short: 'A lock on a number the app chooses, which the database does not tie to any row.',
		explanation:
			'Only code that asks for the same lock respects it, so it suits jobs such as "one worker per home".',
		readMore: postgresql('concurrent-writes-the-postgresql-way', 'Concurrent writes the PostgreSQL way'),
	},
	{
		id: 'postgis',
		term: 'PostGIS',
		aliases: ['PostGIS'],
		short: 'A PostgreSQL extension for places and shapes: types, distance functions, and spatial indexes.',
		explanation:
			'It answers queries such as "homes within 5 km" through a GiST index.',
		readMore: postgresql('searching-by-place', 'Searching by place'),
	},
	{
		id: 'unlogged-table',
		term: 'Unlogged table',
		aliases: ['unlogged table', 'unlogged tables', 'Unlogged table'],
		short: 'A PostgreSQL table whose writes skip the WAL.',
		explanation:
			'Writes are much cheaper, but the table is empty after a crash and is not copied to standbys, which suits caches.',
		readMore: postgresql('caches-counters-and-time-series-inside-postgresql', 'Caches, counters, and time series inside PostgreSQL'),
	},
	{
		id: 'materialized-view',
		term: 'Materialized view',
		aliases: ['materialized view', 'materialized views', 'Materialized view'],
		short: 'A query result stored as a table and refreshed on demand.',
		explanation:
			'Reads are cheap, but the data is as old as the last refresh, and a refresh runs the whole query again.',
		readMore: postgresql('caches-counters-and-time-series-inside-postgresql', 'Caches, counters, and time series inside PostgreSQL'),
	},
	{
		id: 'standby',
		term: 'Standby',
		aliases: ['standbys', 'standby server', 'standby servers'],
		short: 'A PostgreSQL server that replays the WAL of the primary and keeps a copy of its data.',
		explanation:
			'It serves reads and can take over when the primary fails. In general terms it is a follower.',
		readMore: postgresql('copies-on-other-servers', 'Copies on other servers'),
	},
	{
		id: 'streaming-replication',
		term: 'Streaming replication',
		aliases: ['streaming replication', 'Streaming replication'],
		short: 'PostgreSQL replication that sends WAL records to standbys over a connection as they are written.',
		explanation:
			'Each standby is an exact copy of the whole instance on the same major version.',
		readMore: postgresql('copies-on-other-servers', 'Copies on other servers'),
	},
	{
		id: 'replication-slot',
		term: 'Replication slot',
		aliases: ['replication slot', 'replication slots', 'Replication slot'],
		short: 'A record on the primary that makes it keep the WAL a consumer still needs.',
		explanation:
			'A stopped consumer makes WAL pile up. A retention budget checked at checkpoints can invalidate the slot; monitor the WAL each slot holds and the free disk.',
		readMore: postgresql('copies-on-other-servers', 'Copies on other servers'),
	},
	{
		id: 'patroni',
		term: 'Patroni',
		aliases: ['Patroni'],
		short: 'A tool that runs PostgreSQL failover by keeping a leader key in a coordination service such as etcd.',
		explanation:
			'The server that holds the key is the primary; others promote themselves only after the key expires.',
		readMore: postgresql('replacing-a-failed-primary', 'Replacing a failed primary'),
	},
	{
		id: 'logical-decoding',
		term: 'Logical decoding',
		aliases: ['logical decoding', 'Logical decoding'],
		short: 'Turning the WAL of PostgreSQL into a stream of row changes in commit order.',
		explanation:
			'Logical replication and CDC tools read changes this way.',
		readMore: postgresql('copying-changes-row-by-row', 'Copying changes row by row'),
	},
	{
		id: 'table-partitioning',
		term: 'Table partitioning',
		aliases: ['table partitioning', 'Table partitioning'],
		short: 'Splitting one table into several tables on the same server, by ranges, lists, or hashes of a column.',
		explanation:
			'Old data leaves by dropping a partition, and queries skip partitions that cannot match. It adds no capacity.',
		readMore: postgresql('one-table-too-big', 'One table too big'),
	},
	{
		id: 'citus',
		term: 'Citus',
		aliases: ['Citus'],
		short: 'A PostgreSQL extension that splits tables across several servers by a distribution column.',
		explanation:
			'A coordinator routes each query to the servers that hold its rows.',
		readMore: postgresql('when-one-primary-is-not-enough', 'When one primary is not enough'),
	},
	{
		id: 'pg-primary',
		term: 'Primary (PostgreSQL)',
		aliases: ['PostgreSQL primary'],
		short: 'The PostgreSQL server that takes writes and streams its WAL to standbys.',
		explanation:
			'In general terms it is the leader. A cluster has one primary at a time; failover promotes a standby in its place.',
		readMore: postgresql('copies-on-other-servers', 'Copies on other servers'),
	},
	{
		id: 'tsvector',
		term: 'tsvector',
		aliases: ['tsvector'],
		short: 'A PostgreSQL value that holds the searchable words of a text, called lexemes, optionally with positions and weights.',
		explanation:
			'A GIN index over it finds the rows that contain the words of a query.',
		readMore: postgresql('searching-by-words', 'Searching by words'),
	},
	{
		id: 'inventory',
		term: 'Inventory',
		aliases: ['inventory', 'Inventory'],
		short: 'The count of units of one type that exist and that are taken, per period, which a sale checks and changes.',
		explanation:
			'One row per unit type and period, such as a room type and a night, holds both numbers. A sale raises the taken count with an atomic update that keeps it within the total.',
		readMore: reservations('counting-interchangeable-units-per-period', 'Counting interchangeable units per period'),
	},
	{
		id: 'escrow',
		term: 'Escrow',
		aliases: ['escrow', 'Escrow'],
		short: 'Taking a quantity out of a shared count at once and keeping it in the holder\'s own record until it is confirmed or returned.',
		explanation:
			'The count always shows the worst case, so nothing is sold twice even if every hold ends in a sale. The count\'s row stays locked only for a short transaction, while the hold lasts minutes.',
		readMore: reservations('holding-units-while-a-buyer-decides', 'Holding units while a buyer decides'),
	},
	{
		id: 'sweeper',
		term: 'Sweeper',
		aliases: ['sweeper', 'sweepers', 'Sweeper'],
		short: 'A background job that finds expired holds and returns their units.',
		explanation:
			'It reads an index on the expiry in small batches and uses a conditional update, so it is safe to run twice or next to a confirmation. Its interval, plus any backlog, is how long a dead hold keeps units out of sale.',
		readMore: reservations('returning-expired-holds', 'Returning expired holds'),
	},
	{
		id: 'authorization-capture',
		term: 'Authorization and capture',
		aliases: ['authorization', 'authorizations', 'Authorization', 'capture', 'Capture'],
		short: 'A card payment in two steps: the authorization reserves the amount without moving money, and the capture takes it later.',
		explanation:
			'Cancelling an authorization moves no money, so a system can authorize first and capture only after its own records confirm the purchase. An authorization that nobody captures runs out after some days.',
		readMore: reservations('paying-for-a-hold', 'Paying for a hold'),
	},
	{
		id: 'no-show',
		term: 'No-show',
		aliases: ['no-show', 'no-shows', 'No-show', 'No-shows'],
		short: 'A customer with a booking who neither arrives nor cancels.',
		explanation:
			'The unit stays unused, though another buyer would have paid for it. The share of no-shows and its spread decide how far a business may overbook.',
		readMore: reservations('selling-more-than-you-have', 'Selling more than you have'),
	},
	{
		id: 'overbooking',
		term: 'Overbooking',
		aliases: ['overbooking', 'Overbooking', 'overbook'],
		short: 'Selling more units than exist, on purpose, because some buyers do not come.',
		explanation:
			'It fills units that no-shows would leave empty, at the cost of compensating the buyers who find no unit. It fits units with a near equivalent and a bounded cost per broken promise.',
		readMore: reservations('selling-more-than-you-have', 'Selling more than you have'),
	},
	{
		id: 'quota',
		term: 'Quota',
		aliases: ['quota', 'quotas', 'Quota', 'Quotas'],
		short: 'A share of a limited stock that one server or region may sell without asking the others.',
		explanation:
			'Sales need no shared row, but units get stranded: one place turns buyers away while another still has stock. A quota moves only after its old owner records that it gave it up.',
		readMore: reservations('selling-a-unit-everyone-wants', 'Selling a unit everyone wants'),
	},
	{
		id: 'waiting-room',
		term: 'Waiting room',
		aliases: ['waiting room', 'waiting rooms', 'Waiting room'],
		short: 'A queue in front of a site that lets visitors in at a pace the system can serve.',
		explanation:
			'It limits visitors inside and new visitors per minute, and the server checks a token that each admitted visitor gets. Admission does not promise a unit of stock.',
		readMore: reservations('letting-buyers-in-at-a-pace', 'Letting buyers in at a pace'),
	},
	{
		id: 'offer-with-a-deadline',
		term: 'Offer with a deadline',
		aliases: ['offer with a deadline', 'offers with a deadline', 'Offer with a deadline'],
		short: 'A hold that waits for one chosen person\'s answer until a deadline.',
		explanation:
			'The acceptance and the expiry are conditional updates that both check the deadline, so a late acceptance loses. A timer that survives restarts acts on the deadline, and the business decides what an expired offer returns.',
		readMore: reservations('offering-to-one-person-at-a-time', 'Offering to one person at a time'),
	},
];
