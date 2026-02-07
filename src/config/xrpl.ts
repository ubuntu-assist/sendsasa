import { Client } from 'xrpl'
import config from '../utils/config'

const TESTNET_URL = 'wss://s.altnet.rippletest.net:51233'
const MAINNET_URL = 'wss://xrplcluster.com/'

class XRPLClient {
  private readonly client: Client
  private isConnected: boolean = false
  private readonly network: string

  constructor() {
    this.network = config.XRPL_NETWORK || 'testnet'
    const url = this.network === 'mainnet' ? MAINNET_URL : TESTNET_URL
    this.client = new Client(url)

    console.log(`XRPL Client initialized for ${this.network}`)
    console.log(`Server: ${url}`)
  }

  async connect(): Promise<void> {
    if (!this.isConnected) {
      await this.client.connect()
      this.isConnected = true
      console.log('XRPL client connected')
    }
  }

  async disconnect(): Promise<void> {
    if (this.isConnected) {
      await this.client.disconnect()
      this.isConnected = false
      console.log('XRPL client disconnected')
    }
  }

  getClient(): Client {
    if (!this.isConnected) {
      throw new Error('Client not connected. Call connect() first.')
    }
    return this.client
  }

  isTestnet(): boolean {
    return this.network === 'testnet'
  }

  getNetwork(): string {
    return this.network
  }
}

export const xrplClient = new XRPLClient()
