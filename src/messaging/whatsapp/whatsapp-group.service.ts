import axios from 'axios'
import config from '@common/utils/config'
import logger from '@common/utils/logger'

const GRAPH_BASE = config.WHATSAPP_API_URL ?? 'https://graph.facebook.com/v22.0'
const PHONE_BASE = `${GRAPH_BASE}/${config.PHONE_NUMBER_ID}`
const authHeader = () => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${config.ACCESS_TOKEN}`,
})

export async function createWhatsAppGroup(
  name: string,
): Promise<string | undefined> {
  try {
    const res = await axios.post(
      `${PHONE_BASE}/groups`,
      {
        messaging_product: 'whatsapp',
        subject: name.slice(0, 128),
        join_approval_mode: 'auto_approve',
      },
      { headers: authHeader() },
    )
    return res.data.id as string
  } catch (err: any) {
    logger.error(
      `[WAGroup] Create failed: ${err?.response?.data ? JSON.stringify(err.response.data) : err?.message}`,
    )
    return undefined
  }
}

export async function getGroupInviteLink(
  groupId: string,
): Promise<string | undefined> {
  try {
    const res = await axios.get(`${GRAPH_BASE}/${groupId}/invite_link`, {
      headers: authHeader(),
    })
    return res.data.invite_link as string
  } catch (err: any) {
    logger.error(
      `[WAGroup] Get invite link failed for ${groupId}: ${err?.message}`,
    )
    return undefined
  }
}

export async function sendGroupMessage(
  groupId: string,
  text: string,
): Promise<void> {
  try {
    const { WhatsAppService } = await import('./whatsapp.service')
    await WhatsAppService.sendMessage({
      messaging_product: 'whatsapp',
      recipient_type: 'group',
      to: groupId,
      type: 'text',
      text: { body: text },
    })
  } catch (err: any) {
    logger.error(`[WAGroup] Send to ${groupId} failed: ${err?.message}`)
  }
}

export async function deleteWhatsAppGroup(groupId: string): Promise<void> {
  try {
    await axios.delete(`${GRAPH_BASE}/${groupId}`, { headers: authHeader() })
  } catch (err: any) {
    logger.error(`[WAGroup] Delete ${groupId} failed: ${err?.message}`)
  }
}
