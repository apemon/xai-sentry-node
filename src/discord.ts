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
    embeds: [embed]
  })
}

export const notifySubmission = async (
  challengeNumber: number,
  tokenId: number,
  txhash: string
) => {
  const discordUrl = process.env.DISCORD_URL
  const explorerUrl = `https://arbiscan.io/tx/${txhash}`
  const fields = []
  fields.push({
    name: 'token id',
    value: `${tokenId}`,  
  })
  fields.push({
    name: 'txhash',
    value: `${txhash}`,  
  })
  fields.push({
    name: 'explorer url',
    value: explorerUrl,  
  })
  const embed = {
    type: 'rich',
    title: `New Submission: ${challengeNumber}`,
    color: 6225664,
    fields,
    url: explorerUrl
  }
  await axios.post(discordUrl, {
    embeds: [embed]
  })
}