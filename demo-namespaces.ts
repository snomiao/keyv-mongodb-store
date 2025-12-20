/**
 * Demo: Using Different Namespaces with One Collection
 *
 * This demonstrates how multiple Keyv instances can share the same
 * MongoDB collection while maintaining data isolation through namespaces.
 */

import Keyv from "keyv";
import { MongoClient } from "mongodb";
import KeyvMongodbStore from "./src/index";

async function main() {
	// Connect to MongoDB
	const mongoUrl = process.env.MONGO_URL || "mongodb://localhost:27017";
	const client = new MongoClient(mongoUrl);
	await client.connect();
	console.log("✓ Connected to MongoDB");

	const db = client.db("namespace-demo");
	const collection = db.collection("shared-keyv-store");

	// Clean up any existing data
	await collection.deleteMany({});
	console.log("✓ Cleaned up collection");

	// ===================================================================
	// Scenario 1: Multi-tenant application with isolated data
	// ===================================================================
	console.log("\n=== Scenario 1: Multi-tenant Application ===");

	const tenant1Store = new KeyvMongodbStore(collection, { namespace: "tenant-001" });
	const tenant2Store = new KeyvMongodbStore(collection, { namespace: "tenant-002" });
	const tenant3Store = new KeyvMongodbStore(collection, { namespace: "tenant-003" });

	const tenant1 = new Keyv({ store: tenant1Store });
	const tenant2 = new Keyv({ store: tenant2Store });
	const tenant3 = new Keyv({ store: tenant3Store });

	// Each tenant stores their own config
	await tenant1.set("config", { companyName: "Acme Corp", theme: "dark" });
	await tenant2.set("config", { companyName: "TechStart Inc", theme: "light" });
	await tenant3.set("config", { companyName: "Global Ltd", theme: "blue" });

	console.log("Tenant 1 config:", await tenant1.get("config"));
	console.log("Tenant 2 config:", await tenant2.get("config"));
	console.log("Tenant 3 config:", await tenant3.get("config"));

	// Same key, isolated data
	await tenant1.set("user-count", 150);
	await tenant2.set("user-count", 42);
	await tenant3.set("user-count", 8);

	console.log("\nUser counts (same key, different values):");
	console.log("Tenant 1:", await tenant1.get("user-count"));
	console.log("Tenant 2:", await tenant2.get("user-count"));
	console.log("Tenant 3:", await tenant3.get("user-count"));

	// ===================================================================
	// Scenario 2: Different environments sharing one collection
	// ===================================================================
	console.log("\n=== Scenario 2: Different Environments ===");

	const devStore = new KeyvMongodbStore(collection, { namespace: "dev" });
	const stagingStore = new KeyvMongodbStore(collection, { namespace: "staging" });
	const prodStore = new KeyvMongodbStore(collection, { namespace: "prod" });

	const devCache = new Keyv({ store: devStore });
	const stagingCache = new Keyv({ store: stagingStore });
	const prodCache = new Keyv({ store: prodStore });

	await devCache.set("api-endpoint", "https://dev-api.example.com");
	await stagingCache.set("api-endpoint", "https://staging-api.example.com");
	await prodCache.set("api-endpoint", "https://api.example.com");

	console.log("Dev API:", await devCache.get("api-endpoint"));
	console.log("Staging API:", await stagingCache.get("api-endpoint"));
	console.log("Prod API:", await prodCache.get("api-endpoint"));

	// ===================================================================
	// Scenario 3: Feature flags per namespace
	// ===================================================================
	console.log("\n=== Scenario 3: Feature Flags ===");

	const appStore = new KeyvMongodbStore(collection, { namespace: "app" });
	const adminStore = new KeyvMongodbStore(collection, { namespace: "admin" });

	const appFlags = new Keyv({ store: appStore });
	const adminFlags = new Keyv({ store: adminStore });

	await appFlags.set("feature-new-ui", false);
	await adminFlags.set("feature-new-ui", true);

	console.log("App users see new UI:", await appFlags.get("feature-new-ui"));
	console.log("Admin users see new UI:", await adminFlags.get("feature-new-ui"));

	// ===================================================================
	// Scenario 4: Clear operation only affects specific namespace
	// ===================================================================
	console.log("\n=== Scenario 4: Namespace-specific Clear ===");

	// Add some data to multiple namespaces
	await tenant1.set("temp-data", "temp1");
	await tenant2.set("temp-data", "temp2");
	await tenant3.set("temp-data", "temp3");

	console.log("Before clear:");
	console.log("Tenant 1 temp-data:", await tenant1.get("temp-data"));
	console.log("Tenant 2 temp-data:", await tenant2.get("temp-data"));
	console.log("Tenant 3 temp-data:", await tenant3.get("temp-data"));

	// Clear only tenant 2's data
	await tenant2.clear();

	console.log("\nAfter clearing tenant 2:");
	console.log("Tenant 1 temp-data:", await tenant1.get("temp-data"));
	console.log("Tenant 2 temp-data:", await tenant2.get("temp-data")); // undefined
	console.log("Tenant 3 temp-data:", await tenant3.get("temp-data"));

	// ===================================================================
	// Scenario 5: TTL can be different per namespace
	// ===================================================================
	console.log("\n=== Scenario 5: Different TTL per Namespace ===");

	const shortCacheStore = new KeyvMongodbStore(collection, { namespace: "short-cache" });
	const longCacheStore = new KeyvMongodbStore(collection, { namespace: "long-cache" });

	const shortCache = new Keyv({ store: shortCacheStore });
	const longCache = new Keyv({ store: longCacheStore });

	// Short cache: 200ms TTL
	await shortCache.set("data", "expires soon", 200);
	// Long cache: 5000ms TTL
	await longCache.set("data", "expires later", 5000);

	console.log("Initial values:");
	console.log("Short cache:", await shortCache.get("data"));
	console.log("Long cache:", await longCache.get("data"));

	// Wait 300ms
	await new Promise((resolve) => setTimeout(resolve, 300));

	console.log("\nAfter 300ms:");
	console.log("Short cache:", await shortCache.get("data")); // undefined
	console.log("Long cache:", await longCache.get("data")); // still exists

	// ===================================================================
	// View the actual collection structure
	// ===================================================================
	console.log("\n=== Collection Structure ===");
	console.log("All documents in collection:");
	const docs = await collection.find({}).toArray();
	for (const doc of docs) {
		console.log(`  Key: ${doc.key}, Value:`, doc.value);
	}
	console.log(`\nTotal documents: ${docs.length}`);

	// ===================================================================
	// Cleanup
	// ===================================================================
	await collection.deleteMany({});
	await client.close();
	console.log("\n✓ Demo completed and connection closed");
}

main().catch((error) => {
	console.error("Demo failed:", error);
	process.exit(1);
});
