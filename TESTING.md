# Testing Guide

This guide explains how to run tests and demos for keyv-mongodb-store.

## Quick Start with Docker Compose

The easiest way to run tests is using Docker Compose to launch a local MongoDB instance:

### 1. Start MongoDB

```bash
docker-compose up -d
```

This will:
- Start MongoDB 7 on port 27017
- Create a health check to ensure MongoDB is ready
- Persist data in a Docker volume

### 2. Wait for MongoDB to be Ready

```bash
# Check if MongoDB is healthy
docker-compose ps

# Or watch the logs
docker-compose logs -f mongodb
```

Wait until you see the health status as "healthy" or logs showing "Waiting for connections".

### 3. Run Tests

```bash
bun test
# or
npm test
```

### 4. Run Demo

```bash
bun run demo
# or
npm run demo
```

### 5. Stop MongoDB

```bash
# Stop and remove containers
docker-compose down

# Stop and remove containers + volumes (clean slate)
docker-compose down -v
```

## Manual MongoDB Setup

If you prefer to run MongoDB without Docker:

### Install MongoDB

**macOS:**
```bash
brew install mongodb-community
brew services start mongodb-community
```

**Ubuntu/Debian:**
```bash
sudo apt-get install -y mongodb-org
sudo systemctl start mongod
```

**Windows:**
Download and install from [MongoDB Download Center](https://www.mongodb.com/try/download/community)

### Verify MongoDB is Running

```bash
mongosh --eval "db.adminCommand('ping')"
```

## Custom MongoDB URL

You can specify a custom MongoDB URL using the `MONGO_URL` environment variable:

```bash
export MONGO_URL="mongodb://localhost:27017"
bun test

# Or inline
MONGO_URL="mongodb://your-host:27017" bun test
```

## Running Individual Test Suites

```bash
# Run only namespace tests
bun test --test-name-pattern="Multiple Namespaces"

# Run only constructor tests
bun test --test-name-pattern="Constructor"

# Run with verbose output
bun test --verbose
```

## CI/CD Integration

For CI/CD pipelines, you can use the docker-compose setup:

```yaml
# Example GitHub Actions
- name: Start MongoDB
  run: docker-compose up -d

- name: Wait for MongoDB
  run: |
    timeout 30 bash -c 'until docker-compose exec -T mongodb mongosh --eval "db.adminCommand(\"ping\")" > /dev/null 2>&1; do sleep 1; done'

- name: Run tests
  run: bun test

- name: Stop MongoDB
  run: docker-compose down
```

## Troubleshooting

### Connection Refused Error

If you see `ECONNREFUSED` errors:

1. Check MongoDB is running:
   ```bash
   docker-compose ps
   # or for manual install
   mongosh --eval "db.adminCommand('ping')"
   ```

2. Check the port is correct (default: 27017)

3. Check firewall settings aren't blocking the connection

### Port Already in Use

If port 27017 is already in use:

```bash
# Find what's using the port
lsof -i :27017

# Either stop that process or modify docker-compose.yml to use a different port
# Change "27017:27017" to "27018:27017" and set MONGO_URL="mongodb://localhost:27018"
```

### Permission Errors

If you get permission errors with Docker:

```bash
# Add your user to docker group
sudo usermod -aG docker $USER

# Log out and back in, or run
newgrp docker
```

## Test Coverage

The test suite includes:
- ✅ Constructor variations (URI, Db, Collection)
- ✅ Basic CRUD operations (get, set, delete, clear)
- ✅ Complex data types (objects, arrays, nested structures)
- ✅ TTL/expiration handling
- ✅ Namespace isolation
- ✅ Multiple namespaces on same collection (13 tests)
- ✅ getMany batch operations
- ✅ Custom serializers
- ✅ Edge cases (special characters, empty strings, null values)
- ✅ Index creation and verification
- ✅ MongoDB native TTL features

Total: 50+ comprehensive tests
