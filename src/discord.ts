import { Challenge } from './types'
import {ethers} from 'ethers'
import axios from 'axios'

export const notifyNewChallenge = async (
  challengeNumber: number,
  challenge: Challenge,
  eligibleToOwner: Record<number, string>
) => {
  const discordUrl = process.env.DISCORD_URL
  const fields = []
  fields.push({
    name: '💰 total reward',
    value: `${ethers.utils.formatEther(challenge.rewardAmountForClaimers)} esXAI`,  
  })
  fields.push({
    name: `total eligible for this operator`,
    value: `${Object.keys(eligibleToOwner).length}`,
  })
  fields.push({
    name: 'confirm data',
    value: `${challenge.assertionStateRootOrConfirmData}`,
  })
  const tokenIds = Object.keys(eligibleToOwner)
  if (tokenIds.length > 0) {
    tokenIds.map((tokenId) => {
      fields.push({
        name: `🤑 ${eligibleToOwner[Number(tokenId)]}`,
        value: `${tokenId}`
      })
    })
    
  }
  const embed = {
    type: 'rich',
    title: `New challenge ${challengeNumber}`,
    color: 65535,
    fields
  }
  await axios.post(discordUrl, {
    content: 'new Challenge',
    embeds: [embed]
  })
}