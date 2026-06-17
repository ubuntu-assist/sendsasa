import 'dotenv/config'

const PORT = process.env.PORT
const MONGODB_URI = process.env.MONGODB_URI
const XRPL_NETWORK = process.env.XRPL_NETWORK
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY
const WHATSAPP_API_URL = process.env.WHATSAPP_API_URL
const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID
const ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN
const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN
const DB_MAX_POOL_SIZE = process.env.DB_MAX_POOL_SIZE
const DB_MIN_POOL_SIZE = process.env.DB_MIN_POOL_SIZE
const PRIVATE_KEY = process.env.PRIVATE_KEY

// Web3Auth
const WEB3AUTH_CLIENT_ID = process.env.WEB3AUTH_CLIENT_ID
const WEB3AUTH_NETWORK = process.env.WEB3AUTH_NETWORK
const WEB3AUTH_VERIFIER = process.env.WEB3AUTH_VERIFIER

// JWT
const JWT_KID = process.env.JWT_KID
const JWT_ISSUER = process.env.JWT_ISSUER
const JWT_AUDIENCE = process.env.JWT_AUDIENCE
const JWT_PRIVATE_KEY = process.env.JWT_PRIVATE_KEY
const JWT_PUBLIC_KEY = process.env.JWT_PUBLIC_KEY

// Chain RPC URLs
const BSC_RPC_URL = process.env.BSC_RPC_URL
const BASE_RPC_URL = process.env.BASE_RPC_URL
const ETHEREUM_RPC_URL = process.env.ETHEREUM_RPC_URL
const XRPL_WSS_URL = process.env.XRPL_WSS_URL
const SOLANA_RPC_URL = process.env.SOLANA_RPC_URL
const SOLANA_NETWORK = process.env.SOLANA_NETWORK

// Flow IDs
const OFFRAMP_FLOW_ID = process.env.OFFRAMP_FLOW_ID
const CARD_PAYMENT_FLOW_ID = process.env.CARD_PAYMENT_FLOW_ID
const REQUEST_MONEY_FLOW_ID = process.env.REQUEST_MONEY_FLOW_ID
const SEND_MONEY_FLOW_ID = process.env.SEND_MONEY_FLOW_ID
const PIN_SETUP_FLOW_ID = process.env.PIN_SETUP_FLOW_ID
const MANAGE_CONTACTS_FLOW_ID = process.env.MANAGE_CONTACTS_FLOW_ID
const REQUEST_CARD_FLOW_ID = process.env.REQUEST_CARD_FLOW_ID

// Apple Pay domain verification file content (provided by Coinbase CDP)
const APPLE_PAY_DOMAIN_VERIFICATION = process.env.APPLE_PAY_DOMAIN_VERIFICATION

// Fixer.io (FX rates)
const FIXER_API_KEY = process.env.FIXER_API_KEY

// Admin wallet — managed by Web3Auth (same verifier as user wallets)
// Use a dedicated internal identifier, not a phone number.
// Example: ADMIN_VERIFIER_ID=admin.sendsasa
const ADMIN_VERIFIER_ID = process.env.ADMIN_VERIFIER_ID

// Onramper (fiat-to-crypto onramp aggregator)
const ONRAMPER_API_KEY        = process.env.ONRAMPER_API_KEY
const ONRAMPER_WEBHOOK_SECRET = process.env.ONRAMPER_WEBHOOK_SECRET
const ONRAMPER_SIGNING_SECRET = process.env.ONRAMPER_SIGNING_SECRET
const ONRAMPER_SANDBOX        = process.env.ONRAMPER_SANDBOX   // 'true' for test mode

// Public URL of this server (used for redirect URLs)
const SELF_URL = process.env.SELF_URL ?? 'https://api.sendsasa.com'

// Gemini AI
const GEMINI_API_KEY = process.env.GEMINI_API_KEY

// Cloudinary (dispute evidence storage)
const CLOUDINARY_URL = process.env.CLOUDINARY_URL

// MoMo Trust
const MOMOTRUST_FEE_PERCENT = process.env.MOMOTRUST_FEE_PERCENT ?? '0.01'
const SUPPORT_WA_NUMBER = process.env.SUPPORT_WA_NUMBER

// pawaPay (used by MoMo Trust features)
const PAWAPAY_API_TOKEN = process.env.PAWAPAY_API_TOKEN
const PAWAPAY_API_URL = process.env.PAWAPAY_API_URL ?? 'https://api.sandbox.pawapay.io'
const PAWAPAY_CALLBACK_URL = process.env.PAWAPAY_CALLBACK_URL

// MoMo Trust Flow IDs (register in Meta dashboard after creating flows)
const FLOW_ID_TRUSTLOCK_CREATE = process.env.FLOW_ID_TRUSTLOCK_CREATE
const FLOW_ID_NJANGI_CREATE = process.env.FLOW_ID_NJANGI_CREATE
const FLOW_ID_SPLITCHAT_CREATE = process.env.FLOW_ID_SPLITCHAT_CREATE
const FLOW_ID_PAYDAY_CREATE = process.env.FLOW_ID_PAYDAY_CREATE
const FLOW_ID_SAFIPAY_CREATE = process.env.FLOW_ID_SAFIPAY_CREATE
const FLOW_ID_DISPUTE_FILE = process.env.FLOW_ID_DISPUTE_FILE
const FLOW_ID_KOBOKALL_SEND = process.env.FLOW_ID_KOBOKALL_SEND ?? ''
const FLOW_ID_PIN_CONFIRM = process.env.FLOW_ID_PIN_CONFIRM ?? ''
const FLOW_ID_STATEMENT = process.env.FLOW_ID_STATEMENT ?? ''
const WELCOME_VIDEO_ID = process.env.WELCOME_VIDEO_ID ?? ''

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
  PRIVATE_KEY,
  WEB3AUTH_CLIENT_ID,
  WEB3AUTH_NETWORK,
  WEB3AUTH_VERIFIER,
  JWT_KID,
  JWT_ISSUER,
  JWT_AUDIENCE,
  JWT_PRIVATE_KEY,
  JWT_PUBLIC_KEY,
  BSC_RPC_URL,
  BASE_RPC_URL,
  ETHEREUM_RPC_URL,
  XRPL_WSS_URL,
  SOLANA_RPC_URL,
  SOLANA_NETWORK,
  APPLE_PAY_DOMAIN_VERIFICATION,
  FIXER_API_KEY,
  ADMIN_VERIFIER_ID,
  OFFRAMP_FLOW_ID,
  CARD_PAYMENT_FLOW_ID,
  REQUEST_MONEY_FLOW_ID,
  SEND_MONEY_FLOW_ID,
  PIN_SETUP_FLOW_ID,
  MANAGE_CONTACTS_FLOW_ID,
  REQUEST_CARD_FLOW_ID,
  ONRAMPER_API_KEY,
  ONRAMPER_WEBHOOK_SECRET,
  ONRAMPER_SIGNING_SECRET,
  ONRAMPER_SANDBOX,
  SELF_URL,
  GEMINI_API_KEY,
  CLOUDINARY_URL,
  MOMOTRUST_FEE_PERCENT,
  SUPPORT_WA_NUMBER,
  PAWAPAY_API_TOKEN,
  PAWAPAY_API_URL,
  PAWAPAY_CALLBACK_URL,
  FLOW_ID_TRUSTLOCK_CREATE,
  FLOW_ID_NJANGI_CREATE,
  FLOW_ID_SPLITCHAT_CREATE,
  FLOW_ID_PAYDAY_CREATE,
  FLOW_ID_SAFIPAY_CREATE,
  FLOW_ID_DISPUTE_FILE,
  FLOW_ID_KOBOKALL_SEND,
  FLOW_ID_PIN_CONFIRM,
  FLOW_ID_STATEMENT,
  WELCOME_VIDEO_ID,
}
