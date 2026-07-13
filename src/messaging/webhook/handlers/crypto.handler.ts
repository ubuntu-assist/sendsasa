import bcrypt from 'bcrypt'
import { User } from '@models/User'
import { sendTextMessage } from '@messaging/whatsapp/whatsapp.service'

export async function handleSellCryptoConfirm(
  phoneNumber: string,
  asset: string,
  amountStr: string,
  provider: string,
): Promise<void> {
  const amount = parseFloat(amountStr)
  if (Number.isNaN(amount) || amount <= 0) {
    await sendTextMessage(phoneNumber, '❌ Invalid amount.')
    return
  }

  await sendTextMessage(
    phoneNumber,
    `⏳ *Selling ${amount} ${asset}...*\n\nFunds will arrive in your ${provider.toUpperCase()} MoMo shortly.\n\n_This may take a few minutes._`,
  )

  const { CryptoExchangeService } =
    await import('@features/crypto-exchange/crypto-exchange.service')
  const { JupiterService } = await import('@blockchain/dex/jupiter.service')
  const { OneInchService } = await import('@blockchain/dex/oneinch.service')
  const { XrplDexService } = await import('@blockchain/dex/xrpl-dex.service')
  const { CctpService } = await import('@blockchain/bridge/cctp.service')
  const { AllbridgeService } =
    await import('@blockchain/bridge/allbridge.service')

  const svc = new CryptoExchangeService(
    new JupiterService(),
    new OneInchService(),
    new XrplDexService(),
    new CctpService(),
    new AllbridgeService(),
  )

  // Clear context
  await User.updateOne(
    { phoneNumber },
    { $unset: { momotrustContext: 1, momotrustContextUpdatedAt: 1 } },
  )

  svc
    .sellCryptoToMoMo(asset, String(amount), phoneNumber, provider, phoneNumber)
    .catch((err) => console.error('[SellCrypto] error:', err))
}

export async function handleCryptoSwapComplete(
  phoneNumber: string,
  flowData: any,
): Promise<void> {
  const {
    swap_from_asset,
    swap_to_asset,
    swap_from_amount,
    swap_estimated_output,
    swap_order_id,
    swap_pin,
  } = flowData

  const user = await User.findOne({ phoneNumber })
  if (!user) {
    await sendTextMessage(phoneNumber, '❌ User not found.')
    return
  }

  const pinMatch = await bcrypt.compare(String(swap_pin), user.pinHash)
  if (!pinMatch) {
    await sendTextMessage(phoneNumber, '❌ Incorrect PIN. Swap cancelled.')
    return
  }

  await sendTextMessage(
    phoneNumber,
    `⏳ *Swap in progress...*\n\n${swap_from_amount} ${swap_from_asset} → ~${swap_estimated_output} ${swap_to_asset}\n\n_You'll receive a confirmation once it's done._`,
  )

  const { CryptoExchangeService } =
    await import('@features/crypto-exchange/crypto-exchange.service')
  const { JupiterService } = await import('@blockchain/dex/jupiter.service')
  const { OneInchService } = await import('@blockchain/dex/oneinch.service')
  const { XrplDexService } = await import('@blockchain/dex/xrpl-dex.service')
  const { CctpService } = await import('@blockchain/bridge/cctp.service')
  const { AllbridgeService } =
    await import('@blockchain/bridge/allbridge.service')

  const svc = new CryptoExchangeService(
    new JupiterService(),
    new OneInchService(),
    new XrplDexService(),
    new CctpService(),
    new AllbridgeService(),
  )

  // Fire-and-forget — user gets WhatsApp notification on completion
  svc
    .executeOrder(swap_order_id, phoneNumber)
    .catch((err) => console.error('[CryptoSwap] executeOrder error:', err))
}

export async function handleBuyCrypto(
  phoneNumber: string,
  user: any,
  messageText: string,
): Promise<void> {
  if (!user.evm_address) {
    await sendTextMessage(
      phoneNumber,
      '❌ Your EVM wallet is not set up yet. Please contact support.',
    )
    return
  }

  const { createBuyLink } = await import('@onramp/onramper/onramper.service')

  // Parse optional amount from "buy 100" or "buy 50.5"
  const amountMatch = messageText.match(/buy\s+(\d+(\.\d+)?)/)
  const amount = amountMatch ? parseFloat(amountMatch[1]) : undefined

  try {
    const url = await createBuyLink(
      user.whatsappId,
      phoneNumber,
      user.evm_address,
      { amount },
    )
    const { sendCtaUrlButton } =
      await import('@messaging/whatsapp/whatsapp.service')
    await sendCtaUrlButton(
      phoneNumber,
      amount
        ? `Tap below to buy $${amount} USDC. It will land directly in your SendSasa wallet on Base network.`
        : `Tap below to buy USDC. It will land directly in your SendSasa wallet on Base network. Choose your local currency and payment method.`,
      'Buy Crypto',
      url,
    )
  } catch (err) {
    console.error('handleBuyCrypto error:', err)
    await sendTextMessage(
      phoneNumber,
      '❌ Could not generate a buy link. Please try again.',
    )
  }
}
