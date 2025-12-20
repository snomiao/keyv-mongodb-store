import { afterAll, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import Keyv from "keyv";
import { type Collection, type Db, MongoClient } from "mongodb";
import KeyvMongodbStore from "./index";

describe("KeyvMongodbStore", () => {
	let client: MongoClient;
	let db: Db;
	let _collection: Collection;

	beforeAll(async () => {
		// Connect to MongoDB (assumes MongoDB is running on localhost:27017)
		// For CI/CD, you might want to use MongoDB Memory Server
		const mongoUrl = process.env.MONGO_URL || "mongodb://localhost:27017";
		client = new MongoClient(mongoUrl);
		await client.connect();
		db = client.db("keyv-mongodb-store-test");
	});

	afterAll(async () => {
		// Clean up and close connection
		if (db) {
			await db.dropDatabase();
		}
		if (client) {
			await client.close();
		}
	});

	beforeEach(async () => {
		// Clear all collections before each test
		const collections = await db.collections();
		for (const coll of collections) {
			await coll.deleteMany({});
		}
	});

	describe("Constructor", () => {
		it("should create store with MongoDB URI string", async () => {
			const mongoUrl = process.env.MONGO_URL || "mongodb://localhost:27017";
			const store = new KeyvMongodbStore(`${mongoUrl}/keyv-uri-test`);
			const keyv = new Keyv({ store });

			await keyv.set("uri-test", "value");
			const value = await keyv.get("uri-test");
			expect(value).toBe("value");

			await store.close();
		});

		it("should create store with URI and custom collection", async () => {
			const mongoUrl = process.env.MONGO_URL || "mongodb://localhost:27017";
			const store = new KeyvMongodbStore(`${mongoUrl}/keyv-uri-test`, {
				collectionName: "custom-uri",
			});

			expect(store.collection.collectionName).toBe("custom-uri");
			await store.close();
		});

		it("should create store with URI and override dbName", async () => {
			const mongoUrl = process.env.MONGO_URL || "mongodb://localhost:27017";
			const store = new KeyvMongodbStore(mongoUrl, {
				dbName: "override-db",
				collectionName: "test",
			});

			const keyv = new Keyv({ store });
			await keyv.set("test", "value");
			expect(await keyv.get<string>("test")).toBe("value");

			await store.close();
		});

		it("should extract database name from URI", async () => {
			const mongoUrl = process.env.MONGO_URL || "mongodb://localhost:27017";
			const store = new KeyvMongodbStore(`${mongoUrl}/extracted-db`);

			const keyv = new Keyv({ store });
			await keyv.set("test", "value");
			expect(await keyv.get<string>("test")).toBe("value");

			await store.close();
		});

		it("should create store with Db instance and default collection name", () => {
			const store = new KeyvMongodbStore(db);
			expect(store.collection.collectionName).toBe("keyv");
		});

		it("should create store with Db instance and custom collection name", () => {
			const store = new KeyvMongodbStore(db, { collectionName: "custom" });
			expect(store.collection.collectionName).toBe("custom");
		});

		it("should create store with Collection instance directly", () => {
			const coll = db.collection("mycollection");
			const store = new KeyvMongodbStore(coll);
			expect(store.collection.collectionName).toBe("mycollection");
		});

		it("should accept namespace option", () => {
			const store = new KeyvMongodbStore(db, { namespace: "myapp" });
			expect(store.namespace).toBe("myapp");
		});

		it("should accept serializer option", () => {
			const serializer = {
				stringify: JSON.stringify,
				parse: JSON.parse,
			};
			const store = new KeyvMongodbStore(db, { serializer });
			expect(store.serializer).toBe(serializer);
		});
	});

	describe("Basic Operations", () => {
		it("should set and get a value", async () => {
			const store = new KeyvMongodbStore(db);
			const keyv = new Keyv({ store });

			await keyv.set("foo", "bar");
			const value = await keyv.get("foo");
			expect(value).toBe("bar");
		});

		it("should return undefined for non-existent key", async () => {
			const store = new KeyvMongodbStore(db);
			const keyv = new Keyv({ store });

			const value = await keyv.get("nonexistent");
			expect(value).toBeUndefined();
		});

		it("should delete a value", async () => {
			const store = new KeyvMongodbStore(db);
			const keyv = new Keyv({ store });

			await keyv.set("foo", "bar");
			const deleted = await keyv.delete("foo");
			expect(deleted).toBe(true);

			const value = await keyv.get("foo");
			expect(value).toBeUndefined();
		});

		it("should return false when deleting non-existent key", async () => {
			const store = new KeyvMongodbStore(db);
			const keyv = new Keyv({ store });

			const deleted = await keyv.delete("nonexistent");
			expect(deleted).toBe(false);
		});

		it("should update an existing value", async () => {
			const store = new KeyvMongodbStore(db);
			const keyv = new Keyv({ store });

			await keyv.set("foo", "bar");
			await keyv.set("foo", "baz");
			const value = await keyv.get("foo");
			expect(value).toBe("baz");
		});
	});

	describe("Complex Values", () => {
		it("should store and retrieve objects", async () => {
			const store = new KeyvMongodbStore(db);
			const keyv = new Keyv({ store });

			const obj = { name: "Alice", age: 30, roles: ["admin", "user"] };
			await keyv.set("user:1", obj);
			const value = await keyv.get("user:1");
			expect(value).toEqual(obj);
		});

		it("should store and retrieve arrays", async () => {
			const store = new KeyvMongodbStore(db);
			const keyv = new Keyv({ store });

			const arr = [1, 2, 3, 4, 5];
			await keyv.set("numbers", arr);
			const value = await keyv.get("numbers");
			expect(value).toEqual(arr);
		});

		it("should store and retrieve nested objects", async () => {
			const store = new KeyvMongodbStore(db);
			const keyv = new Keyv({ store });

			const nested = {
				user: {
					profile: {
						name: "Bob",
						settings: { theme: "dark", notifications: true },
					},
				},
			};
			await keyv.set("config", nested);
			const value = await keyv.get("config");
			expect(value).toEqual(nested);
		});
	});

	describe("TTL (Time-To-Live)", () => {
		it("should expire value after TTL", async () => {
			const store = new KeyvMongodbStore(db);
			const keyv = new Keyv({ store });

			await keyv.set("temp", "value", 100); // 100ms TTL
			let value = await keyv.get("temp");
			expect(value).toBe("value");

			// Wait for expiration
			await new Promise((resolve) => setTimeout(resolve, 150));

			value = await keyv.get("temp");
			expect(value).toBeUndefined();
		});

		it("should not expire value without TTL", async () => {
			const store = new KeyvMongodbStore(db);
			const keyv = new Keyv({ store });

			await keyv.set("permanent", "value");
			await new Promise((resolve) => setTimeout(resolve, 100));

			const value = await keyv.get("permanent");
			expect(value).toBe("value");
		});

		it("should handle updating TTL", async () => {
			const store = new KeyvMongodbStore(db);
			const keyv = new Keyv({ store });

			await keyv.set("foo", "bar", 50); // 50ms TTL
			await new Promise((resolve) => setTimeout(resolve, 25));

			// Update with longer TTL
			await keyv.set("foo", "baz", 200); // 200ms TTL
			await new Promise((resolve) => setTimeout(resolve, 100));

			// Should still exist
			const value = await keyv.get("foo");
			expect(value).toBe("baz");
		});
	});

	describe("Namespace", () => {
		it("should isolate keys with namespace", async () => {
			const store1 = new KeyvMongodbStore(db, {
				collectionName: "test",
				namespace: "app1",
			});
			const store2 = new KeyvMongodbStore(db, {
				collectionName: "test",
				namespace: "app2",
			});

			const keyv1 = new Keyv({ store: store1 });
			const keyv2 = new Keyv({ store: store2 });

			await keyv1.set("foo", "bar1");
			await keyv2.set("foo", "bar2");

			expect(await keyv1.get<string>("foo")).toBe("bar1");
			expect(await keyv2.get<string>("foo")).toBe("bar2");
		});

		it("should clear only namespaced keys", async () => {
			const store1 = new KeyvMongodbStore(db, {
				collectionName: "test",
				namespace: "app1",
			});
			const store2 = new KeyvMongodbStore(db, {
				collectionName: "test",
				namespace: "app2",
			});

			const keyv1 = new Keyv({ store: store1 });
			const keyv2 = new Keyv({ store: store2 });

			await keyv1.set("foo", "bar1");
			await keyv2.set("foo", "bar2");

			await keyv1.clear();

			expect(await keyv1.get("foo")).toBeUndefined();
			expect(await keyv2.get<string>("foo")).toBe("bar2");
		});
	});

	describe("Clear", () => {
		it("should clear all values without namespace", async () => {
			const store = new KeyvMongodbStore(db, { collectionName: "test" });
			const keyv = new Keyv({ store });

			await keyv.set("foo", "bar");
			await keyv.set("baz", "qux");
			await keyv.clear();

			expect(await keyv.get("foo")).toBeUndefined();
			expect(await keyv.get("baz")).toBeUndefined();
		});

		it("should clear only values with namespace", async () => {
			const storeNs = new KeyvMongodbStore(db, {
				collectionName: "test",
				namespace: "myapp",
			});
			const storeNoNs = new KeyvMongodbStore(db, { collectionName: "test" });

			const keyvNs = new Keyv({ store: storeNs });
			const keyvNoNs = new Keyv({ store: storeNoNs });

			await keyvNs.set("foo", "bar");
			await keyvNoNs.set("baz", "qux");

			await keyvNs.clear();

			expect(await keyvNs.get("foo")).toBeUndefined();
			expect(await keyvNoNs.get<string>("baz")).toBe("qux");
		});
	});

	describe("GetMany", () => {
		it("should get multiple values", async () => {
			const store = new KeyvMongodbStore(db);
			const keyv = new Keyv({ store });

			await keyv.set("key1", "value1");
			await keyv.set("key2", "value2");
			await keyv.set("key3", "value3");

			const values = await store.getMany(["key1", "key2", "key3"]);
			expect(values).toEqual(["value1", "value2", "value3"]);
		});

		it("should return undefined for missing keys in getMany", async () => {
			const store = new KeyvMongodbStore(db);
			const keyv = new Keyv({ store });

			await keyv.set("key1", "value1");

			const values = await store.getMany(["key1", "missing", "key3"]);
			expect(values).toEqual(["value1", undefined, undefined]);
		});
	});

	describe("Serializer", () => {
		it("should use custom serializer for values", async () => {
			const store = new KeyvMongodbStore(db, {
				collectionName: "test",
				serializer: {
					stringify: JSON.stringify,
					parse: JSON.parse,
				},
			});
			const keyv = new Keyv({ store });

			const obj = { name: "Alice", age: 30 };
			await keyv.set("user", obj);
			const value = await keyv.get("user");
			expect(value).toEqual(obj);
		});

		it("should handle serializer errors gracefully", async () => {
			const store = new KeyvMongodbStore(db, {
				collectionName: "test",
				serializer: {
					stringify: (data: any) => {
						if (data === "error") throw new Error("Stringify error");
						return JSON.stringify(data);
					},
					parse: JSON.parse,
				},
			});

			await expect(store.set("key", "error")).rejects.toThrow();
		});
	});

	describe("EventEmitter Compatibility", () => {
		it("should have on method for compatibility", () => {
			const store = new KeyvMongodbStore(db);
			expect(typeof store.on).toBe("function");
		});

		it("should return this from on method", () => {
			const store = new KeyvMongodbStore(db);
			const result = store.on("error", () => {});
			expect(result).toBe(store);
		});
	});

	describe("Index Creation", () => {
		it("should create unique index on key field", async () => {
			const coll = db.collection("indexed-test");
			const _store = new KeyvMongodbStore(coll);

			// Wait a bit for index creation
			await new Promise((resolve) => setTimeout(resolve, 100));

			const indexes = await coll.indexes();
			const keyIndex = indexes.find((idx) => idx.key.key === 1);
			expect(keyIndex).toBeDefined();
			expect(keyIndex?.unique).toBe(true);
		});

		it("should create TTL index on expiresAt field", async () => {
			const coll = db.collection("ttl-index-test");
			const _store = new KeyvMongodbStore(coll);

			// Wait a bit for index creation
			await new Promise((resolve) => setTimeout(resolve, 100));

			const indexes = await coll.indexes();
			const ttlIndex = indexes.find((idx) => idx.key.expiresAt === 1);
			expect(ttlIndex).toBeDefined();
			expect(ttlIndex?.expireAfterSeconds).toBe(0);
		});
	});

	describe("MongoDB Native TTL", () => {
		it("should set expiresAt as Date object for TTL documents", async () => {
			const store = new KeyvMongodbStore(db, { collectionName: "ttl-test" });
			const keyv = new Keyv({ store });

			await keyv.set("ttl-key", "ttl-value", 5000); // 5 second TTL

			const doc = await db.collection("ttl-test").findOne({ key: "ttl-key" });
			expect(doc).toBeDefined();
			expect(doc?.expiresAt).toBeInstanceOf(Date);
			expect(doc?.expiresAt.getTime()).toBeGreaterThan(Date.now());
		});

		it("should not set expiresAt for non-TTL documents", async () => {
			const store = new KeyvMongodbStore(db, { collectionName: "no-ttl-test" });
			const keyv = new Keyv({ store });

			await keyv.set("no-ttl-key", "value");

			const doc = await db.collection("no-ttl-test").findOne({ key: "no-ttl-key" });
			expect(doc).toBeDefined();
			expect(doc?.expiresAt).toBeUndefined();
		});

		it("should remove expiresAt when updating TTL to non-TTL", async () => {
			const store = new KeyvMongodbStore(db, { collectionName: "update-ttl-test" });
			const keyv = new Keyv({ store });

			// First set with TTL
			await keyv.set("update-key", "value1", 5000);
			let doc = await db.collection("update-ttl-test").findOne({ key: "update-key" });
			expect(doc?.expiresAt).toBeInstanceOf(Date);

			// Update without TTL
			await keyv.set("update-key", "value2");
			doc = await db.collection("update-ttl-test").findOne({ key: "update-key" });
			expect(doc?.expiresAt).toBeUndefined();
		});

		it("should update expiresAt when changing TTL", async () => {
			const store = new KeyvMongodbStore(db, { collectionName: "change-ttl-test" });
			const keyv = new Keyv({ store });

			// Set with 1 second TTL
			await keyv.set("change-key", "value1", 1000);
			const doc1 = await db.collection("change-ttl-test").findOne({ key: "change-key" });
			const firstExpiry = doc1?.expiresAt;

			// Wait a bit
			await new Promise((resolve) => setTimeout(resolve, 100));

			// Update with 10 second TTL
			await keyv.set("change-key", "value2", 10000);
			const doc2 = await db.collection("change-ttl-test").findOne({ key: "change-key" });
			const secondExpiry = doc2?.expiresAt;

			expect(secondExpiry).toBeInstanceOf(Date);
			expect(secondExpiry.getTime()).toBeGreaterThan(firstExpiry.getTime());
		});
	});

	describe("URI Connection Tests", () => {
		it("should work with URI and namespace", async () => {
			const mongoUrl = process.env.MONGO_URL || "mongodb://localhost:27017";
			const store = new KeyvMongodbStore(`${mongoUrl}/keyv-namespace-test`, {
				namespace: "app1",
			});
			const keyv = new Keyv({ store });

			await keyv.set("foo", "bar");
			expect(await keyv.get<string>("foo")).toBe("bar");

			await store.close();
		});

		it("should handle URI connection lifecycle", async () => {
			const mongoUrl = process.env.MONGO_URL || "mongodb://localhost:27017";
			const store = new KeyvMongodbStore(`${mongoUrl}/lifecycle-test`);
			const keyv = new Keyv({ store });

			await keyv.set("test", "value1");
			expect(await keyv.get<string>("test")).toBe("value1");

			await keyv.set("test", "value2");
			expect(await keyv.get<string>("test")).toBe("value2");

			await keyv.delete("test");
			expect(await keyv.get("test")).toBeUndefined();

			await store.close();
		});
	});

	describe("Edge Cases", () => {
		it("should handle keys with special characters", async () => {
			const store = new KeyvMongodbStore(db);
			const keyv = new Keyv({ store });

			const specialKey = "user:123:profile:settings";
			await keyv.set(specialKey, "value");
			const value = await keyv.get(specialKey);
			expect(value).toBe("value");
		});

		it("should handle empty string as key", async () => {
			const store = new KeyvMongodbStore(db);
			const keyv = new Keyv({ store });

			await keyv.set("", "empty-key-value");
			const value = await keyv.get("");
			expect(value).toBe("empty-key-value");
		});

		it("should handle null value", async () => {
			const store = new KeyvMongodbStore(db);
			const keyv = new Keyv({ store });

			await keyv.set("null-key", null);
			const value = await keyv.get("null-key");
			expect(value).toBeNull();
		});

		it("should handle boolean values", async () => {
			const store = new KeyvMongodbStore(db);
			const keyv = new Keyv({ store });

			await keyv.set("bool-true", true);
			await keyv.set("bool-false", false);

			expect(await keyv.get<boolean>("bool-true")).toBe(true);
			expect(await keyv.get<boolean>("bool-false")).toBe(false);
		});

		it("should handle number values", async () => {
			const store = new KeyvMongodbStore(db);
			const keyv = new Keyv({ store });

			await keyv.set("number", 42);
			await keyv.set("float", 3.14);
			await keyv.set("negative", -10);
			await keyv.set("zero", 0);

			expect(await keyv.get<number>("number")).toBe(42);
			expect(await keyv.get<number>("float")).toBe(3.14);
			expect(await keyv.get<number>("negative")).toBe(-10);
			expect(await keyv.get<number>("zero")).toBe(0);
		});
	});

	describe("Multiple Namespaces on Same Collection", () => {
		let sharedCollection: Collection;

		beforeEach(async () => {
			sharedCollection = db.collection("shared-namespace-test");
			await sharedCollection.deleteMany({});
		});

		it("should isolate data between different namespaces on same collection", async () => {
			const store1 = new KeyvMongodbStore(sharedCollection, { namespace: "ns1" });
			const store2 = new KeyvMongodbStore(sharedCollection, { namespace: "ns2" });
			const store3 = new KeyvMongodbStore(sharedCollection, { namespace: "ns3" });

			const keyv1 = new Keyv({ store: store1 });
			const keyv2 = new Keyv({ store: store2 });
			const keyv3 = new Keyv({ store: store3 });

			// Set same key with different values in each namespace
			await keyv1.set("config", { env: "ns1" });
			await keyv2.set("config", { env: "ns2" });
			await keyv3.set("config", { env: "ns3" });

			// Each namespace should have its own value
			expect(await keyv1.get("config")).toEqual({ env: "ns1" });
			expect(await keyv2.get("config")).toEqual({ env: "ns2" });
			expect(await keyv3.get("config")).toEqual({ env: "ns3" });
		});

		it("should handle many namespaces on same collection", async () => {
			const namespaces = Array.from({ length: 10 }, (_, i) => `tenant-${i}`);
			const stores = namespaces.map(
				(ns) => new KeyvMongodbStore(sharedCollection, { namespace: ns }),
			);
			const keyvs = stores.map((store) => new Keyv({ store }));

			// Set unique values in each namespace
			for (let i = 0; i < namespaces.length; i++) {
				await keyvs[i].set("value", i * 100);
			}

			// Verify each namespace has correct value
			for (let i = 0; i < namespaces.length; i++) {
				expect(await keyvs[i].get<number>("value")).toBe(i * 100);
			}

			// Verify total document count in collection
			const count = await sharedCollection.countDocuments();
			expect(count).toBe(10);
		});

		it("should support delete operations across namespaces", async () => {
			const store1 = new KeyvMongodbStore(sharedCollection, { namespace: "ns1" });
			const store2 = new KeyvMongodbStore(sharedCollection, { namespace: "ns2" });

			const keyv1 = new Keyv({ store: store1 });
			const keyv2 = new Keyv({ store: store2 });

			await keyv1.set("data", "value1");
			await keyv2.set("data", "value2");

			// Delete from namespace 1
			const deleted = await keyv1.delete("data");
			expect(deleted).toBe(true);

			// Should be gone from namespace 1 but not namespace 2
			expect(await keyv1.get("data")).toBeUndefined();
			expect(await keyv2.get<string>("data")).toBe("value2");
		});

		it("should handle clear operation for specific namespace only", async () => {
			const store1 = new KeyvMongodbStore(sharedCollection, { namespace: "ns1" });
			const store2 = new KeyvMongodbStore(sharedCollection, { namespace: "ns2" });
			const store3 = new KeyvMongodbStore(sharedCollection, { namespace: "ns3" });

			const keyv1 = new Keyv({ store: store1 });
			const keyv2 = new Keyv({ store: store2 });
			const keyv3 = new Keyv({ store: store3 });

			// Add multiple keys to each namespace
			await keyv1.set("key1", "value1");
			await keyv1.set("key2", "value2");
			await keyv2.set("key1", "value1");
			await keyv2.set("key2", "value2");
			await keyv3.set("key1", "value1");
			await keyv3.set("key2", "value2");

			// Clear namespace 2
			await keyv2.clear();

			// Namespace 1 and 3 should still have data
			expect(await keyv1.get<string>("key1")).toBe("value1");
			expect(await keyv1.get<string>("key2")).toBe("value2");
			expect(await keyv3.get<string>("key1")).toBe("value1");
			expect(await keyv3.get<string>("key2")).toBe("value2");

			// Namespace 2 should be empty
			expect(await keyv2.get("key1")).toBeUndefined();
			expect(await keyv2.get("key2")).toBeUndefined();
		});

		it("should support getMany across same collection with different namespaces", async () => {
			const store1 = new KeyvMongodbStore(sharedCollection, { namespace: "ns1" });
			const store2 = new KeyvMongodbStore(sharedCollection, { namespace: "ns2" });

			const keyv1 = new Keyv({ store: store1 });
			const keyv2 = new Keyv({ store: store2 });

			// Set up data in both namespaces
			await keyv1.set("a", 1);
			await keyv1.set("b", 2);
			await keyv1.set("c", 3);
			await keyv2.set("a", 10);
			await keyv2.set("b", 20);
			await keyv2.set("c", 30);

			// GetMany should respect namespace
			const values1 = await store1.getMany(["a", "b", "c"]);
			const values2 = await store2.getMany(["a", "b", "c"]);

			expect(values1).toEqual([1, 2, 3]);
			expect(values2).toEqual([10, 20, 30]);
		});

		it("should handle TTL independently per namespace", async () => {
			const store1 = new KeyvMongodbStore(sharedCollection, { namespace: "ns1" });
			const store2 = new KeyvMongodbStore(sharedCollection, { namespace: "ns2" });

			const keyv1 = new Keyv({ store: store1 });
			const keyv2 = new Keyv({ store: store2 });

			// Set with different TTLs
			await keyv1.set("temp", "expires-fast", 100); // 100ms
			await keyv2.set("temp", "expires-slow", 5000); // 5000ms

			// Both should exist initially
			expect(await keyv1.get<string>("temp")).toBe("expires-fast");
			expect(await keyv2.get<string>("temp")).toBe("expires-slow");

			// Wait for first to expire
			await new Promise((resolve) => setTimeout(resolve, 150));

			// First should be gone, second should remain
			expect(await keyv1.get("temp")).toBeUndefined();
			expect(await keyv2.get<string>("temp")).toBe("expires-slow");
		});

		it("should allow updating values across namespaces independently", async () => {
			const store1 = new KeyvMongodbStore(sharedCollection, { namespace: "ns1" });
			const store2 = new KeyvMongodbStore(sharedCollection, { namespace: "ns2" });

			const keyv1 = new Keyv({ store: store1 });
			const keyv2 = new Keyv({ store: store2 });

			await keyv1.set("counter", 0);
			await keyv2.set("counter", 0);

			// Update independently
			await keyv1.set("counter", 1);
			await keyv2.set("counter", 10);
			await keyv1.set("counter", 2);
			await keyv2.set("counter", 20);

			expect(await keyv1.get<number>("counter")).toBe(2);
			expect(await keyv2.get<number>("counter")).toBe(20);
		});

		it("should handle complex objects in different namespaces", async () => {
			const store1 = new KeyvMongodbStore(sharedCollection, { namespace: "tenant1" });
			const store2 = new KeyvMongodbStore(sharedCollection, { namespace: "tenant2" });

			const keyv1 = new Keyv({ store: store1 });
			const keyv2 = new Keyv({ store: store2 });

			const user1 = {
				id: "user-1",
				name: "Alice",
				roles: ["admin", "user"],
				settings: { theme: "dark", notifications: true },
			};

			const user2 = {
				id: "user-2",
				name: "Bob",
				roles: ["user"],
				settings: { theme: "light", notifications: false },
			};

			await keyv1.set("user-profile", user1);
			await keyv2.set("user-profile", user2);

			expect(await keyv1.get("user-profile")).toEqual(user1);
			expect(await keyv2.get("user-profile")).toEqual(user2);
		});

		it("should correctly prefix keys with namespace in storage", async () => {
			const store1 = new KeyvMongodbStore(sharedCollection, { namespace: "ns1" });
			const store2 = new KeyvMongodbStore(sharedCollection, { namespace: "ns2" });

			const keyv1 = new Keyv({ store: store1 });
			const keyv2 = new Keyv({ store: store2 });

			await keyv1.set("test", "value1");
			await keyv2.set("test", "value2");

			// Check actual keys in collection
			const doc1 = await sharedCollection.findOne({ key: "ns1:test" });
			const doc2 = await sharedCollection.findOne({ key: "ns2:test" });

			expect(doc1?.value).toBe("value1");
			expect(doc2?.value).toBe("value2");
		});

		it("should handle namespace with no data gracefully", async () => {
			const store1 = new KeyvMongodbStore(sharedCollection, { namespace: "ns1" });
			const store2 = new KeyvMongodbStore(sharedCollection, { namespace: "empty" });

			const keyv1 = new Keyv({ store: store1 });
			const keyv2 = new Keyv({ store: store2 });

			await keyv1.set("data", "exists");

			// Empty namespace operations should work
			expect(await keyv2.get("data")).toBeUndefined();
			expect(await keyv2.delete("nonexistent")).toBe(false);
			await keyv2.clear(); // Should not throw
			expect(await store2.getMany(["a", "b"])).toEqual([undefined, undefined]);
		});

		it("should support mixing namespaced and non-namespaced stores on same collection", async () => {
			const storeWithNs = new KeyvMongodbStore(sharedCollection, { namespace: "ns1" });
			const storeNoNs = new KeyvMongodbStore(sharedCollection);

			const keyvWithNs = new Keyv({ store: storeWithNs });
			const keyvNoNs = new Keyv({ store: storeNoNs });

			await keyvWithNs.set("key", "namespaced");
			await keyvNoNs.set("key", "not-namespaced");

			// Both should coexist
			expect(await keyvWithNs.get<string>("key")).toBe("namespaced");
			expect(await keyvNoNs.get<string>("key")).toBe("not-namespaced");

			// Check actual storage
			const nsDoc = await sharedCollection.findOne({ key: "ns1:key" });
			const noNsDoc = await sharedCollection.findOne({ key: "key" });

			expect(nsDoc?.value).toBe("namespaced");
			expect(noNsDoc?.value).toBe("not-namespaced");
		});

		it("should handle special characters in namespace names", async () => {
			const store1 = new KeyvMongodbStore(sharedCollection, {
				namespace: "tenant-123_v2",
			});
			const store2 = new KeyvMongodbStore(sharedCollection, {
				namespace: "env:production",
			});

			const keyv1 = new Keyv({ store: store1 });
			const keyv2 = new Keyv({ store: store2 });

			await keyv1.set("data", "value1");
			await keyv2.set("data", "value2");

			expect(await keyv1.get<string>("data")).toBe("value1");
			expect(await keyv2.get<string>("data")).toBe("value2");
		});

		it("should efficiently store many keys across multiple namespaces", async () => {
			const numNamespaces = 5;
			const keysPerNamespace = 10;

			const stores = Array.from(
				{ length: numNamespaces },
				(_, i) => new KeyvMongodbStore(sharedCollection, { namespace: `ns-${i}` }),
			);
			const keyvs = stores.map((store) => new Keyv({ store }));

			// Populate data
			for (let i = 0; i < numNamespaces; i++) {
				for (let j = 0; j < keysPerNamespace; j++) {
					await keyvs[i].set(`key-${j}`, `ns${i}-value${j}`);
				}
			}

			// Verify data integrity
			for (let i = 0; i < numNamespaces; i++) {
				for (let j = 0; j < keysPerNamespace; j++) {
					expect(await keyvs[i].get<string>(`key-${j}`)).toBe(`ns${i}-value${j}`);
				}
			}

			// Verify total count
			const totalCount = await sharedCollection.countDocuments();
			expect(totalCount).toBe(numNamespaces * keysPerNamespace);
		});
	});
});
