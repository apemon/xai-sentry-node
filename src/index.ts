import { Wallet, ethers } from 'ethers';
import * as LicenseAbi from './abi/license.json'
import * as RefereeAbi from './abi/referee.json'
import * as Multicall2Abi from './abi/Multicall2.json'
import * as cron from 'node-cron'
import { Challenge } from './types'
import {notifyMessage, notifyNewChallenge, notifyNewOwner, notifyPrevChallenge, notifyRemoveOwner, notifySubmission} from './discord'

require('dotenv').config();

const REFEREE_ADDRESS = '0xfD41041180571C5D371BEA3D9550E55653671198'
const LICENSE_ADDRESS = '0xbc14d8563b248B79689ECbc43bBa53290e0b6b66'
const MULTICALL_ADDRESS = '0x842eC2c7D803033Edf55E478F461FC547Bc54EB2'

const provider = new ethers.providers.JsonRpcProvider(process.env.RPC_URL);
const wallet = new Wallet(process.env.OPERATOR_PRIVATE_KEY, provider);
const referee = new ethers.Contract(REFEREE_ADDRESS, RefereeAbi, provider);
const license = new ethers.Contract(LICENSE_ADDRESS, LicenseAbi, provider);
const multicall = new ethers.Contract(MULTICALL_ADDRESS, Multicall2Abi, provider);

// global var
const ownerNftList: Record<string, number[]> = {}
const nftToOwner: Record<number, string> = {}
let challengeCounter = 0
let currentChallenge: Challenge
let prevChallenge: Challenge

const getOwnerList = async (operatorAddress: string) => {
  const ownerCount: ethers.BigNumber = await referee.getOwnerCountForOperator(operatorAddress)
  // const refereeInterface = new ethers.utils.Interface(RefereeAbi)
  const refereeInterface = referee.interface
  const calldatas = []
  for (let i = 0; i < ownerCount.toNumber(); i++) {
    calldatas.push({
      target: REFEREE_ADDRESS,
      callData: refereeInterface.encodeFunctionData('getOwnerForOperatorAtIndex', [operatorAddress,ethers.BigNumber.from(i)])
    })
  }
  const {returnData } = await multicall.callStatic.tryBlockAndAggregate(true, calldatas)
  const ownerList:string[] = []
  returnData.map((x:any[]) => {
    if (x[0] == true) {
      ownerList.push(ethers.utils.defaultAbiCoder.decode(["address"], x[1])[0])
    }
  })
  return ownerList
}

const getOwnerNftList = async (ownerList: string[]) => {
  const existingOwner = Object.keys(ownerNftList)
  await Promise.all(existingOwner.map(async (owner) => {
    if (!ownerList.includes(owner)) {
      delete ownerNftList[owner]
      await notifyRemoveOwner(owner)
    }
  }))
  let calldatas = []
  for (let i=0;i<ownerList.length;i++) {
    calldatas.push({
      target: LICENSE_ADDRESS,
      callData: license.interface.encodeFunctionData('balanceOf', [ownerList[i]])
    })
  }
  const {returnData:balanceOfReturnData } = await multicall.callStatic.tryBlockAndAggregate(true, calldatas)
  
  for (let i=0;i<ownerList.length;i++) {
    calldatas = []
    const owner = ownerList[i]
    const balance = ethers.utils.defaultAbiCoder.decode(["uint256"], balanceOfReturnData[i][1])[0].toNumber()
    if (!ownerNftList[owner] || ownerNftList[owner].length != balance) {
      ownerNftList[owner] = []
      for (let j=0;j<balance;j++) {
        calldatas.push({
          target: LICENSE_ADDRESS,
          callData: license.interface.encodeFunctionData('tokenOfOwnerByIndex', [ownerList[i], j])
        })
      }
      const {returnData:tokenOwnerReturnData } = await multicall.callStatic.tryBlockAndAggregate(true, calldatas)
      for (let j=0;j<balance;j++) {
        const tokenId = ethers.utils.defaultAbiCoder.decode(["uint256"], tokenOwnerReturnData[j][1])[0].toNumber()
        if (!nftToOwner[tokenId]) {
          nftToOwner[tokenId] = owner
        }
        ownerNftList[owner].push(tokenId)
      }
      await notifyNewOwner(owner, ownerNftList[owner])
    }
  }
}

const getNewChallenge = async () => {
  const currentChallengeCounter = (await referee.challengeCounter()).toNumber()
  if (challengeCounter < currentChallengeCounter) {
    challengeCounter = currentChallengeCounter
    if (currentChallenge) {
      prevChallenge = await getChallenge(challengeCounter - 2)
      await notifyPrevChallenge(challengeCounter - 2, prevChallenge)
      // claim reward (if any)
    }
    currentChallenge = await getChallenge(challengeCounter - 1)
    await checkEligible()
  }
}

const getChallenge = async(chllengeNumber: number): Promise<Challenge> => {
  const {
      openForSubmissions,
      expiredForRewarding,
      assertionId,
      assertionStateRootOrConfirmData,
      assertionTimestamp,
      challengerSignedHash,
      activeChallengerPublicKey,
      rollupUsed,
      createdTimestamp,
      totalSupplyOfNodesAtChallengeStart,
      rewardAmountForClaimers,
      amountForGasSubsidy,
      numberOfEligibleClaimers,
      amountClaimedByClaimers
    } = await referee.getChallenge(challengeCounter - 1)
    const challenge = {
      openForSubmissions,
      expiredForRewarding,
      assertionId,
      assertionStateRootOrConfirmData,
      assertionTimestamp,
      challengerSignedHash,
      activeChallengerPublicKey,
      rollupUsed,
      createdTimestamp,
      totalSupplyOfNodesAtChallengeStart,
      rewardAmountForClaimers,
      amountForGasSubsidy,
      numberOfEligibleClaimers,
      amountClaimedByClaimers
    }
    return challenge
}

const checkEligible = async () => {
  const calldatas = []
  const tokenIds = Object.keys(nftToOwner)
  if (!currentChallenge.openForSubmissions) {
    return
  }
  for (let i=0;i<tokenIds.length;i++) {
    const tokenId = tokenIds[i]
    calldatas.push({
      target: REFEREE_ADDRESS,
      callData: referee.interface.encodeFunctionData('createAssertionHashAndCheckPayout', [
        tokenId,
        challengeCounter - 1,
        currentChallenge.assertionStateRootOrConfirmData,
        currentChallenge.challengerSignedHash
      ])
    })
  }
  const {returnData } = await multicall.callStatic.tryBlockAndAggregate(true, calldatas)
  const eligibleList: Record<number, boolean> = {}
  const eligibles: number[] = []
  for (let i=0;i<tokenIds.length;i++) {
    const tokenId = Number(tokenIds[i])
    const eligible = ethers.utils.defaultAbiCoder.decode(["bool"], returnData[i][1])[0]
    // summarize for all eligible
    eligibleList[tokenId] = eligible
    if (eligible) {
      eligibles.push(tokenId)
    }
  }
  // notify
  const eligibleToOwner:string[] = []
  eligibles.map(tokenId => {
    eligibleToOwner.push(`${nftToOwner[tokenId]}: ${tokenId}`)
  })
  
  await notifyNewChallenge(challengeCounter -1, currentChallenge, eligibleToOwner)
  // submit assertion
  await Promise.all(eligibles.map(async (tokenId) => {
    try {
      const response = await referee.connect(wallet).submitAssertionToChallenge(
        tokenId,
        challengeCounter - 1,
        currentChallenge.assertionStateRootOrConfirmData,
      )
      await notifySubmission(challengeCounter - 1, tokenId, response.hash)
    } catch (err) {
      console.log(err)
      await notifyMessage(err.toString())
    }
  }))
}

const main = async () => { 
  // load operator -> owner
  const operatorAddress = await wallet.getAddress()
  console.log('start operator...')
  cron.schedule('*/15 * * * *', async () => {
    try {
      console.log(`running at ${new Date().toISOString()}`)
      const ownerList = await getOwnerList(operatorAddress)
      // load each owner nft
      await getOwnerNftList(ownerList)
      // load current challenge -> if got new, notify the old one
      await getNewChallenge()
      // await notifySubmission(12, 21000, '0x0xxx')
      // check eligible -> send assert -> notify
      // check reward
      // save current progress
    } catch (err) {
      console.log(err)
      await notifyMessage(err.toString())
    }
    
  })
  
}

main()