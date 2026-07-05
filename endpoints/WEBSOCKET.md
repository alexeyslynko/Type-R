# Basic WebSocket endpoints

`@type-r/endpoints` includes a small WebSocket endpoint intended for simple live collection updates.

Use it when you need:

- one WebSocket connection shared by several collections;
- simple `subscribe` / `unsubscribe` messages;
- `updated` and `removed` events applied to a collection;
- no reconnect, replay, heartbeat, cursor, or protocol versioning.

Production realtime protocols can add reconnect, `since`, event replay, heartbeat, structured errors, and resync on top of this basic endpoint.

## Basic collection endpoint

```ts
import { auto, CollectionConstructor, define, Record } from '@type-r/models'
import { websocketIO } from '@type-r/endpoints'

@define
class User extends Record {
    static Collection: CollectionConstructor<User>

    static endpoint = websocketIO('ws://localhost:3000/live', {
        subscribeMessage: () => ({
            type: 'subscribe',
            channel: 'users'
        }),

        unsubscribeMessage: () => ({
            type: 'unsubscribe',
            channel: 'users'
        }),

        match: message => message.channel === 'users'
    })

    @auto name: string
}

const users = new User.Collection()

await users.liveUpdates(true)
```

Supported update envelope:

```json
{
    "channel": "users",
    "type": "updated",
    "payload": {
        "id": "1",
        "name": "Ann"
    }
}
```

Supported remove envelope:

```json
{
    "channel": "users",
    "type": "removed",
    "payload": "1"
}
```

Compact envelopes are supported too:

```json
{ "updated": { "id": "1", "name": "Ann" } }
```

```json
{ "removed": "1" }
```

## REST + basic WebSocket

`restfulWebsocketIO` combines REST CRUD with basic WebSocket live updates.

```ts
import { restfulWebsocketIO } from '@type-r/endpoints'

static endpoint = restfulWebsocketIO(
    'http://localhost:3000/api/users',
    'ws://localhost:3000/live',
    {
        subscribeMessage: () => ({ type: 'subscribe', channel: 'users' }),
        unsubscribeMessage: () => ({ type: 'unsubscribe', channel: 'users' }),
        match: message => message.channel === 'users'
    }
)
```

`fetch({ liveUpdates: true })` subscribes first, then performs the REST list request. The basic endpoint resolves subscription as soon as the WebSocket is open and the subscribe message has been sent.

```ts
const users = new User.Collection()

await users.fetch({ liveUpdates: true })
```

## Options

```ts
interface WebSocketEndpointOptions {
    WebSocket?: WebSocketConstructor
    protocols?: string | string[]
    match?: (message: any, collection?: any) => boolean
    subscribeMessage?: object | ((collection?: any) => any)
    unsubscribeMessage?: object | ((collection?: any) => any)
}
```

`match` is important when several collections share the same socket. Without it, every message is delivered to every subscription on that socket.

The basic endpoint uses JSON messages only: outgoing subscribe/unsubscribe messages are encoded with `JSON.stringify()`, and incoming string messages are decoded with `JSON.parse()`.

## Limitations

The basic endpoint intentionally does not implement:

- subscribe acknowledgements;
- reconnect and resubscribe;
- heartbeat;
- `since` cursors;
- event log replay;
- out-of-order detection;
- structured protocol errors;
- server shutdown handling.

Use a custom endpoint when you need these features.
