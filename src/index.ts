import type { KeyvStoreAdapter } from "keyv";
import { type Collection, type Db, MongoClient, type MongoClientOptions } from "mongodb";

type MongoConnectionOptions = {
	uri?: string;
	dbName?: string;
	collectionName?: string;
	namespace?: string;
	mongoClientOptions?: MongoClientOptions;
	serializer?: {
		parse: (data: string) => any;
		stringify: (data: any) => string;
	};
};

/**
 * A Keyv store implementation using MongoDB as the backend.
 *
 * @example
 * ```ts
 * import Keyv from "keyv";
 * import { KeyvMongodbStore } from "./KeyvMongodbStore";
 *
 * // Using MongoDB URI
 * const store = new KeyvMongodbStore("mongodb://localhost:27017/mydb");
 * const keyv = new Keyv({ store });
 *
 * await keyv.set("foo", "bar");
 * const value = await keyv.get("foo"); // "bar"
 * ```
 *
 * @example
 * ```ts
 * // Using Db instance
 * import { MongoClient } from "mongodb";
 * const client = new MongoClient("mongodb://localhost:27017");
 * await client.connect();
 * const db = client.db("mydb");
 * const store = new KeyvMongodbStore(db, { collectionName: "keyv" });
 * ```
 *
 * @example
 * ```ts
 * // Using Collection instance
 * const collection = db.collection("mycollection");
 * const store = new KeyvMongodbStore(collection);
 * ```
 */
export default class KeyvMongodbStore implements KeyvStoreAdapter {
	opts: any = {};
	collection!: Collection;
	namespace?: string;
	private client?: MongoClient;
	private initPromise?: Promise<void>;

	/**
	 * MongoDB handles complex keys and values natively,
	 * but you can provide serialize and deserialize options if needed
	 */
	serializer?: {
		parse: (data: any) => any;
		stringify: (data: any) => any;
	};

	constructor(uriOrDbOrCollection: string | Db | Collection, options: MongoConnectionOptions = {}) {
		this.namespace = options.namespace;
		this.serializer = options.serializer;

		// Handle string URI
		if (typeof uriOrDbOrCollection === "string") {
			this.initPromise = this._initFromUri(uriOrDbOrCollection, options);
		}
		// Check if it's a Db instance
		else if (
			"collection" in uriOrDbOrCollection &&
			typeof uriOrDbOrCollection.collection === "function"
		) {
			const collectionName = options.collectionName || "keyv";
			this.collection = uriOrDbOrCollection.collection(collectionName);
			this._setupCollection();
		}
		// It's a Collection instance
		else {
			this.collection = uriOrDbOrCollection as Collection;
			this._setupCollection();
		}
	}

	private async _initFromUri(uri: string, options: MongoConnectionOptions): Promise<void> {
		this.client = new MongoClient(uri, options.mongoClientOptions);
		await this.client.connect();

		// Extract db name from URI or use provided dbName
		let dbName = options.dbName;
		if (!dbName) {
			// Try to extract from URI
			const match = uri.match(/\/([^/?]+)(\?|$)/);
			if (match?.[1]) {
				dbName = match[1];
			} else {
				dbName = "keyv"; // default db name
			}
		}

		const db = this.client.db(dbName);
		const collectionName = options.collectionName || "keyv";
		this.collection = db.collection(collectionName);
		this._setupCollection();
	}

	private _setupCollection(): void {
		// Ensure unique index on key field for performance
		this.collection.createIndex({ key: 1 }, { unique: true }).catch(() => {
			// Ignore error if index already exists
		});

		// Create TTL index on expiresAt field
		// MongoDB will automatically delete documents when expiresAt Date is reached
		// expireAfterSeconds: 0 means delete immediately when the date/time passes
		this.collection.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }).catch(() => {
			// Ignore error if index already exists
		});
	}

	private async _ensureInitialized(): Promise<void> {
		if (this.initPromise) {
			await this.initPromise;
		}
	}

	/**
	 * Close the MongoDB connection (only if created from URI)
	 */
	async close(): Promise<void> {
		if (this.client) {
			await this.client.close();
		}
	}

	// IEventEmitter interface methods
	on(_event: string, _listener: (...arguments_: any[]) => void): this {
		// MongoDB doesn't have event emitter, so we return this for compatibility
		return this;
	}

	private _getKey(key: string): string {
		return this.namespace ? `${this.namespace}:${key}` : key;
	}

	async get<Value>(key: string): Promise<Value | undefined> {
		await this._ensureInitialized();
		const prefixedKey = this._getKey(key);
		const doc = await this.collection.findOne({ key: prefixedKey });
		if (!doc) {
			return undefined;
		}
		// MongoDB TTL index will automatically delete expired documents
		// But there's a background task that runs every 60 seconds, so we do a safety check
		if (doc?.expiresAt && doc.expiresAt < new Date()) {
			await this.collection.deleteOne({ key: prefixedKey });
			return undefined;
		}
		return this.serializer ? this.serializer.parse(doc.value) : doc.value;
	}

	async getMany<Value>(keys: string[]): Promise<Array<Value | undefined>> {
		await this._ensureInitialized();
		const prefixedKeys = keys.map((key) => this._getKey(key));

		// Use MongoDB's $in operator to fetch all documents in one query
		const docs = await this.collection.find({ key: { $in: prefixedKeys } }).toArray();

		// Create a map for quick lookup
		const docMap = new Map();
		const now = new Date();

		for (const doc of docs) {
			// Check expiration (safety check before TTL index cleanup)
			if (doc?.expiresAt && doc.expiresAt < now) {
				// Delete expired document
				this.collection.deleteOne({ key: doc.key }).catch(() => {
					// Ignore deletion errors
				});
				continue;
			}
			docMap.set(doc.key, this.serializer ? this.serializer.parse(doc.value) : doc.value);
		}

		// Return results in the same order as input keys
		return prefixedKeys.map((prefixedKey) => docMap.get(prefixedKey));
	}

	async set(key: string, value: any, ttl?: number): Promise<void> {
		await this._ensureInitialized();
		const prefixedKey = this._getKey(key);

		const doc: any = {
			key: prefixedKey,
			value: this.serializer ? this.serializer.stringify(value) : value,
			updatedAt: new Date(),
		};

		// MongoDB TTL index requires a Date object, not a timestamp
		if (ttl) {
			doc.expiresAt = new Date(Date.now() + ttl);
		} else {
			// Remove expiresAt field if no TTL (use $unset)
			await this.collection.updateOne(
				{ key: prefixedKey },
				{
					$set: doc,
					$unset: { expiresAt: "" },
				},
				{ upsert: true },
			);
			return;
		}

		await this.collection.updateOne({ key: prefixedKey }, { $set: doc }, { upsert: true });
	}

	async delete(key: string) {
		await this._ensureInitialized();
		const prefixedKey = this._getKey(key);
		const result = await this.collection.deleteOne({ key: prefixedKey });
		return result.deletedCount > 0;
	}

	async clear(): Promise<void> {
		await this._ensureInitialized();
		if (this.namespace) {
			// Only clear keys with this namespace
			const pattern = new RegExp(`^${this.namespace}:`);
			await this.collection.deleteMany({ key: pattern });
		} else {
			// Clear all keys if no namespace
			await this.collection.deleteMany({});
		}
	}
}

// Named export for convenience
export { KeyvMongodbStore };
