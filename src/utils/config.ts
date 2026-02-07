import 'dotenv/config'

const PORT = process.env.PORT
const MONGODB_URI =
  process.env.NODE_ENV === 'test'
    ? process.env.TEST_MONGODB_URI
    : process.env.MONGODB_URI
const XRPL_NETWORK = process.env.XRPL_NETWORK
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY
const WHATSAPP_API_URL = process.env.WHATSAPP_API_URL
const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID
const ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN
const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN
const DB_MAX_POOL_SIZE = process.env.DB_MAX_POOL_SIZE
const DB_MIN_POOL_SIZE = process.env.DB_MIN_POOL_SIZE

export default {
  MONGODB_URI,
  PORT,
  XRPL_NETWORK,
  ENCRYPTION_KEY,
  WHATSAPP_API_URL,
  PHONE_NUMBER_ID,
  ACCESS_TOKEN,
  VERIFY_TOKEN,
  DB_MAX_POOL_SIZE,
  DB_MIN_POOL_SIZE,
}
