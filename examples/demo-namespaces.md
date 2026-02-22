# Multiple Namespaces Demo

This demo showcases how to use different namespaces with a single MongoDB collection, enabling efficient multi-tenant applications and data isolation.

## Prerequisites

### Option 1: Using Docker Compose (Recommended)

The easiest way to get started:

```bash
# Start MongoDB in the background
docker-compose up -d

# Or use the npm script
npm run docker:up
```

### Option 2: Manual MongoDB Installation

1. MongoDB must be running on `localhost:27017`, or set the `MONGO_URL` environment variable:
   ```bash
   export MONGO_URL="mongodb://your-mongodb-url:27017"
   ```

2. Install dependencies:
   ```bash
   bun install
   # or
   npm install
   ```

See [TESTING.md](./TESTING.md) for detailed setup instructions.

## Running the Demo

```bash
# Using bun
bun run demo

# Using npm
npm run demo

# Or directly
bun run demo-namespaces.ts
```

## What the Demo Covers

### 1. Multi-tenant Application
- Shows how multiple tenants can share a single collection
- Each tenant has isolated data using different namespaces
- Same keys in different namespaces store different values

### 2. Different Environments
- Demonstrates dev, staging, and production environments sharing one collection
- Each environment maintains its own configuration

### 3. Feature Flags
- Shows how to manage feature flags per namespace
- Different user groups can have different feature enablement

### 4. Namespace-specific Clear
- Demonstrates that clearing one namespace doesn't affect others
- Data isolation is maintained even during cleanup operations

### 5. Different TTL per Namespace
- Shows how the same key can have different expiration times in different namespaces
- Useful for implementing varying cache policies per tenant

### 6. Collection Structure
- Displays the actual MongoDB documents to show how namespaces are stored
- Keys are prefixed with the namespace (e.g., `tenant-001:config`)

## Expected Output

The demo will:
1. Connect to MongoDB
2. Create multiple namespaced stores on a single collection
3. Demonstrate data isolation between namespaces
4. Show how operations (get, set, delete, clear) work independently
5. Display the underlying collection structure
6. Clean up and close the connection

## Key Benefits

- **Resource Efficiency**: One collection, one set of indexes
- **Data Isolation**: Complete separation between namespaces
- **Simplified Management**: Single collection to monitor and backup
- **Cost Effective**: Fewer collections = lower costs in managed services
- **Flexible**: Each namespace can have different TTL policies

## Testing

To run the comprehensive test suite covering namespace functionality:

```bash
bun test
# or
npm test
```

The test suite includes:
- Data isolation between namespaces
- Namespace-specific clear operations
- Independent TTL per namespace
- getMany operations across namespaces
- Mixing namespaced and non-namespaced stores
- Edge cases and special characters in namespace names
- Performance with many namespaces and keys
