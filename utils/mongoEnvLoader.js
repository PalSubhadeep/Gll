const { MongoClient } = require('mongodb');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const dns = require('dns');

// Configure DNS to bypass Windows local ISP DNS SRV lookup blocks
try {
  dns.setServers(['8.8.8.8', '1.1.1.1', '8.8.4.4']);
} catch (e) {
  // Fallback if custom servers cannot be set
}

let mongoClientInstance = null;

/**
 * Get cached or new MongoClient connection
 */
async function getMongoClient() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    return null;
  }
  if (!mongoClientInstance) {
    mongoClientInstance = new MongoClient(uri, {
      serverSelectionTimeoutMS: 5000,
    });
    await mongoClientInstance.connect();
  }
  return mongoClientInstance;
}

/**
 * Get target MongoDB database & collection
 */
async function getEnvironmentsCollection() {
  const client = await getMongoClient();
  if (!client) return null;
  const dbName = process.env.MONGODB_DB || 'gll_test_db';
  const db = client.db(dbName);
  return db.collection('environments');
}

/**
 * Fetch environment variables from MongoDB Atlas for a given envName ('dev', 'uat', 'demo')
 */
async function getEnvFromMongo(envName) {
  try {
    const collection = await getEnvironmentsCollection();
    if (!collection) return null;
    const doc = await collection.findOne({ env: envName.toLowerCase() });
    return doc ? doc.variables || {} : null;
  } catch (error) {
    console.warn(`[MongoEnvLoader] Warning: Could not fetch '${envName}' from MongoDB Atlas:`, error.message);
    return null;
  }
}

/**
 * Load environment variables from MongoDB Atlas into process.env with local fallback
 */
async function loadEnvFromMongo(envName = 'dev') {
  const targetEnv = (envName || 'dev').toLowerCase();
  console.log(`\n[MongoEnvLoader] Loading environment variables for target: '${targetEnv}'...`);

  // Try fetching from MongoDB Atlas
  const mongoVars = await getEnvFromMongo(targetEnv);

  if (mongoVars && Object.keys(mongoVars).length > 0) {
    console.log(`[MongoEnvLoader] ✅ Successfully loaded ${Object.keys(mongoVars).length} variables from MongoDB Atlas (${targetEnv}).`);
    for (const [key, value] of Object.entries(mongoVars)) {
      process.env[key] = value;
    }
    process.env.ENV = targetEnv;
    return mongoVars;
  }

  // Fallback to local .env.<env> or .env
  console.warn(`[MongoEnvLoader] ⚠️ Mongo data not found or unreachable. Falling back to local file system...`);
  const localFilePath = path.resolve(__dirname, '..', `.env.${targetEnv}`);
  const fallbackPath = fs.existsSync(localFilePath) ? localFilePath : path.resolve(__dirname, '..', '.env');
  
  if (fs.existsSync(fallbackPath)) {
    console.log(`[MongoEnvLoader] Loading local file: ${path.basename(fallbackPath)}`);
    const parsed = dotenv.parse(fs.readFileSync(fallbackPath));
    for (const [key, value] of Object.entries(parsed)) {
      process.env[key] = value;
    }
    process.env.ENV = targetEnv;
    return parsed;
  }

  return {};
}

/**
 * Update or set a single environment variable in MongoDB Atlas
 */
async function updateEnvInMongo(envName, key, value) {
  const collection = await getEnvironmentsCollection();
  if (!collection) {
    throw new Error('MONGODB_URI is not configured in environment.');
  }

  const targetEnv = (envName || 'dev').toLowerCase();
  const updateQuery = {};
  updateQuery[`variables.${key}`] = value;
  updateQuery['updatedAt'] = new Date();

  const result = await collection.updateOne(
    { env: targetEnv },
    { $set: updateQuery },
    { upsert: true }
  );

  return result;
}

/**
 * Bulk save/replace environment variables for an environment in MongoDB Atlas
 */
async function setBulkEnvInMongo(envName, variablesObj) {
  const collection = await getEnvironmentsCollection();
  if (!collection) {
    throw new Error('MONGODB_URI is not configured in environment.');
  }

  const targetEnv = (envName || 'dev').toLowerCase();
  const result = await collection.updateOne(
    { env: targetEnv },
    {
      $set: {
        env: targetEnv,
        variables: variablesObj,
        updatedAt: new Date(),
      },
    },
    { upsert: true }
  );

  return result;
}

module.exports = {
  getMongoClient,
  getEnvFromMongo,
  loadEnvFromMongo,
  updateEnvInMongo,
  setBulkEnvInMongo,
};
