# keyv-mongodb-store

A [Keyv](https://github.com/jaredwray/keyv) store implementation using [MongoDB](https://www.mongodb.com/) as the backend storage.

## Features

- **MongoDB-based storage** - Persistent key-value storage using MongoDB
- **Flexible initialization** - Pass a MongoDB URI string, Database instance, or Collection instance
- **Namespace support** - Organize your data with namespaces
- **TTL support** - Set time-to-live for automatic key expiration
- **Custom serialization** - Optional JSON serialization for complex data types
- **TypeScript** - Fully typed with TypeScript support
- **Native MongoDB features** - Leverages MongoDB's indexing and query capabilities
- **Auto-connect** - Automatically connects when using URI string

## Installation

```bash
bun install keyv-mongodb-store mongodb
```

Or with npm:

```bash
npm install keyv-mongodb-store mongodb
```

## Usage

### Basic Example with MongoDB URI (Recommended)

```ts
import Keyv from "keyv";
import { KeyvMongodbStore } from "keyv-mongodb-store";

// The simplest way - pass a MongoDB URI
// Database name will be extracted from URI, defaults to "keyv" collection
const store = new KeyvMongodbStore("mongodb://localhost:27017/mydb");
const keyv = new Keyv({ store });

// Set a value
await keyv.set("foo", "bar");

// Get a value
const value = await keyv.get("foo"); // "bar"

// Delete a value
await keyv.delete("foo");

// Clear all values
await keyv.clear();

// Don't forget to close the connection when done
await store.close();
```

### URI with Options

```ts
// Specify custom collection name and namespace
const store = new KeyvMongodbStore("mongodb://localhost:27017/mydb", {
  collectionName: "cache",
  namespace: "myapp"
});

// Or override the database name from URI
const store2 = new KeyvMongodbStore("mongodb://localhost:27017", {
  dbName: "customdb",
  collectionName: "sessions"
});
```

### With Database Instance

```ts
import Keyv from "keyv";
import { MongoClient } from "mongodb";
import { KeyvMongodbStore } from "keyv-mongodb-store";

const client = new MongoClient("mongodb://localhost:27017");
await client.connect();
const db = client.db("mydb");

// Pass a database instance (will create/use a collection named "keyv")
const store = new KeyvMongodbStore(db);
const keyv = new Keyv({ store });

await keyv.set("foo", "bar");
const value = await keyv.get("foo"); // "bar"
```

### Using a Custom Collection Name

```ts
const store = new KeyvMongodbStore(db, { collectionName: "mycache" });
const keyv = new Keyv({ store });

await keyv.set("user:1", { name: "Alice" });
```

### Passing a Collection Instance Directly

```ts
const collection = db.collection("keyv");
const store = new KeyvMongodbStore(collection);
const keyv = new Keyv({ store });

await keyv.set("foo", "bar");
```

### With Namespace

```ts
const store = new KeyvMongodbStore(db, {
  collectionName: "cache",
  namespace: "myapp"
});

const keyv = new Keyv({ store });

await keyv.set("user:1", { name: "Alice" });
// Stored with key: "myapp:user:1"
```

### With TTL (Time-To-Live)

This package uses MongoDB's native TTL (Time To Live) indexes for automatic document expiration. MongoDB automatically deletes expired documents in the background.

```ts
const keyv = new Keyv({ store });

// Set a value that expires in 1 second (1000ms)
await keyv.set("temp", "value", 1000);

// Wait for expiration
await new Promise(resolve => setTimeout(resolve, 1100));

const value = await keyv.get("temp"); // undefined
```

**How TTL Works:**
- When you set a TTL, the document's `expiresAt` field is set to a Date object
- MongoDB's TTL index monitor runs every 60 seconds to remove expired documents
- This implementation also includes immediate expiration checks during `get()` operations for instant feedback
- No manual cleanup required - MongoDB handles it automatically!

### With Custom Serialization

```ts
const store = new KeyvMongodbStore(db, {
  collectionName: "cache",
  serializer: {
    stringify: JSON.stringify,
    parse: JSON.parse
  }
});

const keyv = new Keyv({ store });

// Store complex objects
await keyv.set("user", { id: 1, name: "Alice", roles: ["admin", "user"] });
```

## API

### `new KeyvMongodbStore(uriOrDbOrCollection, options)`

Creates a new MongoDB store instance.

#### Parameters

**`uriOrDbOrCollection`** - Can be one of three types:
- **`string`** (MongoDB URI) - Automatically connects to MongoDB using the URI
  - Example: `"mongodb://localhost:27017/mydb"`
  - Database name is extracted from URI or use `dbName` option
  - Connection is managed internally
- **`Db`** (MongoDB Database instance) - Use an existing database connection
  - A collection will be created/used based on `collectionName` option
  - You manage the connection lifecycle
- **`Collection`** (MongoDB Collection instance) - Use an existing collection directly
  - The collection will be used as-is
  - You manage the connection lifecycle

#### Options

- `dbName` (string, optional) - Database name (only used with URI, overrides URI database)
- `collectionName` (string, optional) - Name of the collection to use (default: "keyv")
- `namespace` (string, optional) - Prefix for all keys
- `mongoClientOptions` (MongoClientOptions, optional) - MongoDB client options (only used with URI)
- `serializer` (object, optional) - Custom serialization for values
  - `stringify` (function) - Serialize value to string
  - `parse` (function) - Deserialize string to value

### Store Methods

Implements the [Keyv Store Adapter](https://github.com/jaredwray/keyv#store-adapters) interface:

- `get(key)` - Get a value by key
- `getMany(keys)` - Get multiple values by keys (optimized with `$in` query)
- `set(key, value, ttl?)` - Set a value with optional TTL in milliseconds
- `delete(key)` - Delete a value by key
- `clear()` - Clear all values (respects namespace)
- `close()` - Close the MongoDB connection (only if created from URI)

## Performance Features

### Native MongoDB TTL Indexes

This implementation leverages MongoDB's native TTL (Time To Live) index feature:

- **Automatic cleanup**: MongoDB automatically removes expired documents via background tasks
- **Zero overhead**: No manual polling or cleanup logic needed
- **Efficient**: Uses Date-based indexing for optimal performance
- **Reliable**: MongoDB's TTL monitor runs every 60 seconds
- **Immediate feedback**: Additional expiration checks in `get()` for instant response

### Optimized Queries

- **Unique index on key field**: Fast lookups with O(1) performance
- **Batch operations**: `getMany()` uses MongoDB's `$in` operator for efficient multi-key retrieval
- **Single query**: Fetches multiple documents in one database round-trip

### Document Structure

```javascript
{
  key: "namespace:key",           // Indexed for fast lookup
  value: { /* any value */ },     // Your data
  updatedAt: Date,                // Last update timestamp
  expiresAt: Date                 // TTL expiration (indexed)
}
```

## Why MongoDB?

MongoDB is a powerful NoSQL database that:

- Provides robust persistence and reliability
- Scales horizontally for large datasets
- Supports advanced indexing and querying
- Offers built-in replication and sharding
- Works well in distributed systems
- Has excellent tooling and monitoring

Perfect for:

- Production applications
- Large-scale caching
- Distributed systems
- Applications already using MongoDB
- Scenarios requiring advanced querying

## Comparison with keyv-nedb-store

| Feature | keyv-mongodb-store | keyv-nedb-store |
|---------|-------------------|-----------------|
| Database | MongoDB (server) | NeDB (embedded) |
| Initialization | URI / Db / Collection | File path / Options |
| Scalability | Horizontal scaling | Single instance |
| Query capabilities | Advanced | Basic |
| Best for | Production, distributed systems | Development, small apps |
| Setup complexity | Requires MongoDB server | Zero setup |
| URI support | ✅ Supported | ❌ Not applicable |
| Collection instance | ✅ Supported | ❌ Not applicable |

## Development

Built with [Bun](https://bun.com):

```bash
# Install dependencies
bun install

# Format code
bun run fmt

# Build
bun run build
```

## License

MIT

## Related

- [Keyv](https://github.com/jaredwray/keyv) - Simple key-value storage with support for multiple backends
- [MongoDB](https://www.mongodb.com/) - The most popular NoSQL database
- [keyv-nedb-store](https://github.com/snomiao/keyv-nedb-store) - NeDB-based store for embedded use cases
