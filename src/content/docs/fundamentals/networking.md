---
title: Networking
description: How components communicate over a network, from a single request to many servers around the world.
---

Every system design has boxes connected by arrows, and every arrow is a network call. To defend a design, you need to know how these calls work and how to choose between the options for each of them.

## The app talks to the server

A messenger starts simple: the mobile app sends a message to a server, and the server stores it in a database.

Each exchange has a client and a server. The client starts it with a request; the server handles the request and returns a response. In request-response, the server only answers; it never starts an exchange itself. Client and server are roles: the server is a server to the app and a client to the database.

::diagram{name="client-server"}

The app must know where to send the request.

## Finding the server

Every machine on a network has an IP address, and the network carries data to it in small pieces called packets. A port picks the program on that machine. The app needs both to connect.

The app could keep the server's IP address in its code, but then the server could not move without a new app release. So the app knows a name, and DNS turns it into an IP address. To move the server, you change one DNS record. The answer is cached, so most requests skip the lookup.

Inside the system, the server finds the database by name too. Services that start and stop often, for example during autoscaling, use service discovery: a registry that keeps track of which instances are alive. <!-- link: patterns/service-discovery -->

::diagram{name="dns-discovery"}

Packets can get lost on the way or arrive out of order.

## Delivering data

A text message must arrive whole and in order, and TCP takes care of that. The app and the server first open a connection; then TCP numbers the data, resends what was lost, and puts it back in order. The cost is waiting: a lost packet holds up everything after it until it arrives again.

Now the messenger adds voice calls, and here waiting hurts. A lost piece of audio is useless half a second later, and holding up the next pieces only adds delay. UDP fits this case: it sends separate messages with no connection, no resends, and no order, so nothing waits. If the app cares about a loss, it handles it itself, for example by hiding a short gap in the sound.

::diagram{name="tcp-udp"}

:::do
Use TCP by default: almost all traffic between apps, services, and databases runs on it. Pick UDP when late data is useless because newer data replaces it: voice and video calls, live game state.
:::

Anyone on the path can still read or change the data.

## Securing the connection

Messages are private, but they pass through networks the messenger does not control. TLS protects them: it encrypts the data, detects any change on the way, and checks the server's certificate, so the app knows it talks to the real server. Inside the system, the server and the database can check each other's certificates too (mTLS), so only known components can connect. <!-- link: fundamentals/security -->

Security costs time. Before the first message moves, TCP opens the connection, and then TLS checks the certificate and agrees on keys. Each of these handshakes takes at least one round trip, so a new connection is slow to start.

::diagram{name="connection-setup"}

:::do
Reuse connections. The app keeps its connection open between messages (keep-alive), and the server keeps a pool of open connections to the database.
:::

The bytes now arrive safely, but the app and the server still have to agree on what they mean.

## Agreeing on the format

To send a message, the app must say what it wants and pass the data, and the server must say whether it worked. HTTP is the common format for this. A request has a method and a path, such as `POST /messages`, headers with details like the user's token, and a body with the message. A response has a status code, headers, and a body. The status code starts with 2 on success, with 4 when the client must fix the request, and with 5 when the server failed and a retry may help. HTTP over TLS is called HTTPS.

::diagram{name="http-message"}

HTTP is stateless: each request stands on its own and carries what the server needs, such as the token.

In practice, HTTP/1.1 sends one request at a time over a connection, so clients open several connections. HTTP/2 sends many requests over one connection at the same time, but they share one TCP stream, and a lost packet still holds up all of them. HTTP/3 runs over QUIC, which is built on UDP: a lost packet holds up only the requests whose data it carried, and one round trip sets up both the connection and encryption. This helps mobile apps on unstable networks.

On top of HTTP, requests follow an API style: REST for most public APIs, gRPC between internal services, GraphQL when different clients need different data. <!-- link: technologies/api-styles -->

A new message from a friend reaches the server, but the server cannot pass it to the app until the app asks.

## Pushing new messages

The simplest fix is polling: the app asks "anything new?" every few seconds. It works everywhere, but most requests return nothing, and a message waits up to one interval.

Long polling cuts the wait. The server holds the request open until a message arrives, answers, and the app asks again right away. Messages arrive almost at once, but each one still costs a new request.

SSE keeps one HTTP response open, and the server writes events into it as they come. If the connection breaks, the client reconnects and tells the server the last event it got. SSE only goes from the server to the client, and it carries text only.

A messenger also sends a lot from the app: messages, typing indicators, read receipts. WebSocket gives both sides one open connection. It starts as an HTTP request and then switches to a two-way channel over TCP, where either side can send at any time.

::diagram{name="push-options"}

:::tradeoff
Polling is the simplest option and the slowest. The others deliver at once but keep a request or connection open, which holds memory on the server and breaks when anything on the path drops idle connections. WebSocket also leaves HTTP behind, with no caching and no status codes, so the app builds its own acknowledgments and reconnects.
:::

:::do
Pick the simplest option that meets your delay target: polling when a delay of seconds is fine, long polling when updates must arrive at once but a stream is not possible, SSE when only the server pushes, WebSocket when both sides send often.
:::

Voice and video calls take a different path. Audio sent through the server travels farther and loads the server, so WebRTC connects the two phones directly over UDP. The messenger's server only helps them find each other, over the WebSocket (signaling). When a direct path is blocked, a TURN server relays the audio. <!-- link: technologies/webrtc -->

One server can hold only so many connections, and if it goes down, the messenger goes down with it.

## Adding servers

The messenger grows, and one server is not enough. You run several, and each client must reach one of them. DNS can return all their addresses, but clients cache the answer, so a crashed server keeps getting traffic until the cache expires.

A load balancer fixes this. Clients connect to its single address, and it forwards the traffic to the servers. It runs health checks and stops sending traffic to a failed server within seconds.

::diagram{name="load-balancer"}

:::interview
If asked whether the balancer is a new single point of failure: run several. In active-passive, a standby takes over the address when the main balancer fails. In active-active, DNS spreads clients across the balancers, and health checks remove a failed one from the answers.
:::

Load balancers differ in how much of the traffic they understand. The OSI model splits network communication into layers, and three of them matter for balancing:

| Layer | Job | Protocols |
|---|---|---|
| L3, network | Deliver packets between machines | IP |
| L4, transport | Carry data between programs | TCP, UDP |
| L7, application | Define the messages of the app | HTTP, WebSocket, DNS |

An L4 balancer sees only addresses and ports and forwards whole connections. An L7 balancer ends TLS and reads each HTTP request, so it can route by what the request contains. <!-- link: technologies/load-balancers -->

::diagram{name="l4-l7"}

:::tradeoff
L7 sees requests, so it can route, retry, and check tokens, but it spends CPU on decrypting and parsing. L4 is faster and works with any protocol, but it cannot look inside the traffic.
:::

:::do
Use an L7 balancer for HTTP and WebSocket traffic. Pick L4 for other protocols, or when the balancer must not decrypt the traffic.
:::

The balancer still has to decide which server gets each request.

## Spreading the load

If any server can handle any request, the choice is simple. Round robin sends requests to the servers in turn. It works when the servers are equal and requests cost about the same.

When servers differ in size, weighted round robin sends more requests to the bigger ones. When requests differ in cost, the balancer looks at the current load instead, for example the number of active requests on each server. Long-lived connections stay open for hours, so the number of open connections is a better sign of load: least connections sends each new one to the server with the fewest.

::diagram{name="balancing"}

:::do
Start with round robin for short requests. Use least connections for long-lived connections.
:::

Not every server can handle every request, though.

## Servers with state

A server is stateless when it keeps no user data between requests: sessions and other user data live in a shared database or cache. Any server can then take any request, the balancer can use any algorithm, and a crashed server loses no user data.

When a server keeps state in memory, requests from the same user must come back to it. Sticky sessions do this: the balancer remembers which server a user went to, by a cookie or by the client's address. The price is uneven load, and when that server crashes, its state is gone.

:::do
Keep servers stateless and move state to a shared store. Use sticky sessions only when state cannot leave the server.
:::

An open connection is different. A long-lived connection, such as WebSocket or SSE, stays on the server that accepted it without any sticky sessions, so a message for that user has to find this server. Real-time systems route messages between servers for this. <!-- link: patterns/real-time -->

::diagram{name="open-connection"}

Users far from the servers wait longer for every round trip.

## Users far away

The messenger now has users on other continents. Every round trip to a distant server takes longer, and a new connection needs several of them before the first message moves. <!-- link: fundamentals/requirements -->

Users also send photos and videos, and these files never change after upload. A CDN keeps copies on servers near users, so the files come from close by. <!-- link: technologies/cdn -->

Messages still go to your servers. To bring them closer, run the servers in several regions and send each user to the nearest one. GeoDNS does this by answering with the address of a region near the user.

::diagram{name="regions"}

:::tradeoff
When a region fails, health checks remove it from the DNS answers, and the TTL decides how soon clients see the change. A short TTL moves users away quickly, but clients look up the name more often. A long TTL means fewer lookups, but users keep going to the failed region for longer.
:::

Each region needs the data its users read. Copying data between regions makes reads fast but forces a choice between speed and consistency. <!-- link: fundamentals/replication -->

:::do
Put static files behind a CDN first. Add regions when users on several continents need fast responses from your servers.
:::

Wherever the servers are, some calls still fail.

## When a call fails

The app sends a message and gets no answer. The request may have been lost, the server may have saved the message and lost the response, or the server may just be slow. The app cannot tell which.

First, the app must stop waiting. A call without a timeout can hang forever and hold a connection the whole time. So every call gets a timeout. When one request calls other services, it passes the remaining deadline along, so they can stop work that is no longer needed.

Most failures are short, so the app retries. Retries add load to a server that may already be struggling, so the app waits longer before each attempt (exponential backoff), adds a random delay so that clients do not retry all at once (jitter), and stops after a few attempts. Retry only temporary failures, such as timeouts and 503 Service Unavailable, and only when repeating the call is safe. A 4xx response usually means the request itself is wrong.

::diagram{name="retries"}

:::avoid
Retrying without limits. When a server slows down, every client retries at the same time, and the extra load keeps the server down.
:::

Servers protect themselves from too many requests as well. A rate limit caps how many requests each client may send, and the server answers the rest with 429 Too Many Requests, often with a Retry-After header. Unlike other 4xx responses, this one is worth retrying, after the time the server asked for. <!-- link: patterns/rate-limiting -->

A retry after a timeout can deliver the message twice, because the first attempt may have worked. To prevent this, the app creates an idempotency key, a unique ID for the message, and sends it with every attempt. The server stores the keys it has processed, and for a repeated key it returns the saved result instead of saving the message again.

::diagram{name="idempotency-key"}

:::do
Give every network call a timeout. Retry temporary failures only when repeating the call is safe, a few times, with backoff and jitter. For writes that could create duplicates, add an idempotency key.
:::

When a dependency keeps failing, retries only make it worse. A circuit breaker stops calling it for a while and fails fast instead. <!-- link: patterns/resilience -->

## Cheat sheet

- In request-response, the client starts and the server answers. One component can be a server to its caller and a client to the database.
- Clients find servers by a DNS name, not an IP address. Internal services that start and stop often use service discovery.
- Use TCP by default. Use UDP when late data is useless: calls, live game state.
- Encrypt all traffic: TLS for connections, while WebRTC encrypts calls itself. Reuse connections to skip the handshakes: keep-alive for clients, pools for services.
- HTTP carries requests: 2xx is success, 4xx means fix the request, 5xx means the server failed. REST outside, gRPC inside, GraphQL for clients that need different data.
- To push updates, pick the simplest option that meets the delay target: polling, long polling, SSE for server-to-client streams, WebSocket for both directions. Calls go peer to peer over WebRTC.
- Put servers behind a load balancer with health checks. L7 for HTTP and WebSocket, L4 for other protocols or when the balancer must not decrypt. Run more than one balancer.
- Round robin for similar short requests, weighted round robin for servers of different size, current load for requests of different cost, least connections for long-lived connections.
- Keep servers stateless with state in a shared store. Use sticky sessions only when state cannot leave the server. An open connection stays on its server.
- For distant users: a CDN for static files first, then regions with GeoDNS. Health checks and the TTL decide how fast users leave a failed region.
- Every call gets a timeout; after a timeout, the call may still have worked. Retry temporary failures only when repeating is safe, a few times, with backoff and jitter. Use an idempotency key for writes that could create duplicates, wait as long as Retry-After asks, and stop calling a failing dependency with a circuit breaker.
