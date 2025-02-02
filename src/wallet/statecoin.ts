// Statecoin is a Mercury shared key along with all deposit information.

import { Network } from "bitcoinjs-lib";
import { Transaction as BTCTransaction } from "bitcoinjs-lib/types/transaction";
import { ACTION } from ".";
import { ElectrumTxData } from "./electrum";
import { MasterKey2 } from "./mercury/ecdsa"
import { decodeSecp256k1Point, pubKeyTobtcAddr } from "./util";
import { BatchData, BSTRequestorData, SwapID, SwapInfo } from "./swap/swap";
import { SCEAddress, TransferFinalizeData, TransferMsg3 } from "./mercury/transfer";

export class StateCoinList {
  coins: StateCoin[]

  constructor() {
    this.coins = [];
  }

  static fromJSON(coins_json: StateCoinList): StateCoinList {
    let statecoins = new StateCoinList()
    coins_json.coins.forEach((item: StateCoin) => {
      let coin = new StateCoin(item.shared_key_id, item.shared_key);
      coin.wallet_version = "";
      statecoins.coins.push(Object.assign(coin, item))
    })
    return statecoins
  }

  getAllCoins(block_height: number) {
    return this.coins.map((item: StateCoin) => {
      return item.getDisplayInfo(block_height)
    })
  };

  getUnspentCoins(block_height: number) {
    let total = 0
    let coins = this.coins.filter((item: StateCoin) => {
      if (
        item.status===STATECOIN_STATUS.AVAILABLE ||
        item.status===STATECOIN_STATUS.IN_SWAP ||
        item.status===STATECOIN_STATUS.AWAITING_SWAP ||
        item.status===STATECOIN_STATUS.IN_TRANSFER ||
        item.status===STATECOIN_STATUS.WITHDRAWN
      ) {
        // Add all but withdrawn coins to total balance 
        if (item.status!==STATECOIN_STATUS.WITHDRAWN) {
          total += item.value
        }
        return item
      }
      return null
    })
    return [coins.map((item: StateCoin) => item.getDisplayInfo(block_height)), total]
  };

  // Return coins that are awaiting funding tx to be broadcast
  getInitialisedCoins() {
    return this.coins.filter((item: StateCoin) => {
      if (item.status === STATECOIN_STATUS.INITIALISED) {
        return item
      }
      return null
    })
  };

  // Return coins that are awaiting funding tx confirmations
  getInMempoolCoins() {
    return this.coins.filter((item: StateCoin) => {
      if (item.status === STATECOIN_STATUS.IN_MEMPOOL) {
        return item
      }
      return null
    })
  };

  // Find all coins in mempool or mined but with required_confirmations confirmations
  getUnconfirmedCoins() {
    return this.coins.filter((item: StateCoin) => {
      if (item.status === STATECOIN_STATUS.UNCONFIRMED || item.status === STATECOIN_STATUS.IN_MEMPOOL) {
        return item
      }
      return null
    })
  };

  getCoin(shared_key_id: string): StateCoin | undefined {
    return this.coins.find(coin => coin.shared_key_id === shared_key_id)
  }

  // creates new coin with Date.now()
  addNewCoin(shared_key_id: string, shared_key: MasterKey2) {
    this.coins.push(new StateCoin(shared_key_id, shared_key))
  };
  // Add already constructed statecoin
  addCoin(statecoin: StateCoin) {
    this.coins.push(statecoin)
  };

  // Remove coin from list
  removeCoin(shared_key_id: string, testing_mode: boolean) {
    this.coins = this.coins.filter(item => {
      if (item.shared_key_id!==shared_key_id) {
        return item
      } else {
        if (item.status!==STATECOIN_STATUS.INITIALISED && !testing_mode) {
          throw Error("Should not remove coin whose funding transaction has been broadcast.")
        }
      }})
  };


  setCoinSpent(shared_key_id: string, action: string, transfer_msg?: TransferMsg3) {
    let coin = this.getCoin(shared_key_id)
    if (coin) {
      switch (action) {
        case ACTION.WITHDRAW:
          coin.setWithdrawn();
          return;
        case ACTION.TRANSFER:
          coin.setInTransfer();
          coin.transfer_msg = transfer_msg!;
          return;
        case ACTION.SWAP:
          coin.setSwapped();
          return;
      }
    } else {
      throw Error("No coin found with shared_key_id " + shared_key_id);
    }
  }

  // Funding Tx seen on network. Set coin status and funding_txid
  setCoinInMempool(shared_key_id: string, funding_tx_data: ElectrumTxData) {
    let coin = this.getCoin(shared_key_id)
    if (coin) {
      coin.setInMempool()
      coin.funding_txid = funding_tx_data.tx_hash
      coin.funding_vout = funding_tx_data.tx_pos
    } else {
      throw Error("No coin found with shared_key_id " + shared_key_id);
    }
  }

  // Funding Tx mined. Set coin status and block height
  setCoinUnconfirmed(shared_key_id: string, funding_tx_data: ElectrumTxData) {
    let coin = this.getCoin(shared_key_id)
    if (coin) {
      coin.setUnconfirmed()
      coin.block = funding_tx_data.height
      if (coin.funding_txid==="") { // May have missed setCoinInMempool call.
        coin.funding_txid = funding_tx_data.tx_hash
        coin.funding_vout = funding_tx_data.tx_pos
      }
    } else {
      throw Error("No coin found with shared_key_id " + shared_key_id);
    }
  }

  setCoinFinalized(finalized_statecoin: StateCoin) {
    let statecoin = this.getCoin(finalized_statecoin.shared_key_id)
    // TODO: do some checks here
    if (statecoin) {
      statecoin = finalized_statecoin
    } else {
      throw Error("No coin found with shared_key_id " + finalized_statecoin.shared_key_id);
    }
  }

  setCoinWithdrawTx(shared_key_id: string, tx_withdraw: BTCTransaction) {
    let coin = this.getCoin(shared_key_id)
    if (coin) {
      coin.tx_withdraw = tx_withdraw
    } else {
      throw Error("No coin found with shared_key_id " + shared_key_id);
    }
  }

  removeCoinFromSwap(shared_key_id: string) {
    let coin = this.getCoin(shared_key_id)
    if (coin) {
      if (coin.status===STATECOIN_STATUS.IN_SWAP) throw Error("Swap already begun. Cannot remove coin.");
      if (coin.status!==STATECOIN_STATUS.AWAITING_SWAP) throw Error("Coin is not in a swap pool.");
      coin.setSwapDataToNull();
    } else {
      throw Error("No coin found with shared_key_id " + shared_key_id);
    }
  }
}

// STATUS represent each stage in the lifecycle of a statecoin.
export const STATECOIN_STATUS = {
  // INITIALISED coins are awaiting their funding transaction to appear in the mempool
  INITIALISED: "INITIALISED",
  // IN_MEMPOOL funding transaction in the mempool
  IN_MEMPOOL: "IN_MEMPOOL",
  // UNCONFIRMED coins are awaiting more confirmations on their funding transaction
  UNCONFIRMED: "UNCONFIRMED",
  // Coins are fully owned by wallet and unspent
  AVAILABLE: "AVAILABLE",
  // Coin has been sent but not yet received.
  IN_TRANSFER: "IN_TRANSFER",
  // Coin currently waiting in swap pool
  AWAITING_SWAP: "AWAITING_SWAP",
  // Coin currently carrying out swap protocol
  IN_SWAP: "IN_SWAP",
  // Coin used to belonged to wallet but has been transferred
  SPENT: "SPENT",
  // Coin used to belonged to wallet but has been withdraw
  WITHDRAWN: "WITHDRAWN",
  // Coin used to belonged to wallet but has been swapped
  SWAPPED: "SWAPPED",
  // Coin has performed transfer_sender and has valid TransferMsg3 to be claimed by receiver
  SPEND_PENDING: "SPEND_PENDING",
  // Coin has reached it's backup timelock and has been spent
  EXPIRED: "EXPIRED",
};
Object.freeze(STATECOIN_STATUS);

// STATUS represent each stage in the lifecycle of a statecoin.
export const BACKUP_STATUS = {
  // PRE_LOCKTIME backup transactions are not valid yet as block_height < nLocktime
  PRE_LOCKTIME: "Not Final",
  // UNBROADCAST are valid transactions (block_height >= nLocktime) yet to be broadcast
  UNBROADCAST: "Unbroadcast",
  // IN_MEMPOOL backup transactions are accepted into the mempool
  IN_MEMPOOL: "In mempool",
  // CONFIRMED backup transactions are included in a block, but as yet unspent
  CONFIRMED: "Confirmed",
  // POST_INTERVAL backup transactions are not yet confirmed, but the previous owner nLocktime <= block_height
  POST_INTERVAL: "Interval elapsed",
  // TAKEN backup transactions have failed to confirm in time and the output has been spent by a previous owner
  TAKEN: "Output taken",
  // SPENT backup transactions have been spent to a specified address
  SPENT: "Spent"
};
Object.freeze(BACKUP_STATUS);

// Each individual StateCoin
export class StateCoin {
  shared_key_id: string;    // SharedKeyId
  statechain_id: string;   // StateChainId
  shared_key: MasterKey2;
  wallet_version: string;
  proof_key: string;
  value: number;
  funding_txid: string;
  funding_vout: number;
  block: number;  // included in block number. 0 for unconfirmed.
  timestamp: number;
  tx_backup: BTCTransaction | null;
  backup_status: string;
  interval: number;
  tx_cpfp: BTCTransaction | null;
  tx_withdraw: BTCTransaction | null;
  smt_proof: InclusionProofSMT | null;
  swap_rounds: number;
  status: string;

  // Transfer data
  transfer_msg: TransferMsg3 | null

 // Swap data
  swap_status: string | null;
  swap_id: SwapID | null;
  swap_info: SwapInfo | null;
  swap_address: SCEAddress | null;
  swap_my_bst_data: BSTRequestorData | null;
  swap_receiver_addr: SCEAddress | null;
  swap_transfer_msg: TransferMsg3 | null;
  swap_batch_data: BatchData | null;
  swap_transfer_finalized_data: TransferFinalizeData | null;

  constructor(shared_key_id: string, shared_key: MasterKey2) {
    this.shared_key_id = shared_key_id;
    this.statechain_id = "";
    this.shared_key = shared_key;
    this.wallet_version = require("../../package.json").version
    this.proof_key = "";
    this.value = 0;
    this.timestamp = new Date().getTime();

    this.funding_txid = "";
    this.funding_vout = 0;
    this.block = -1; // marks tx has not been mined
    this.swap_rounds = 0
    //this.swap_participants = 0
    this.tx_backup = null;
    this.backup_status = BACKUP_STATUS.PRE_LOCKTIME;
    this.interval = 1;
    this.tx_cpfp = null;
    this.tx_withdraw = null;
    this.smt_proof = null;
    this.status = STATECOIN_STATUS.INITIALISED;

    this.transfer_msg = null;

    this.swap_status = null;
    this.swap_id = null
    this.swap_address = null;
    this.swap_info = null;
    this.swap_my_bst_data = null;
    this.swap_receiver_addr = null;
    this.swap_transfer_msg = null;
    this.swap_batch_data = null;
    this.swap_transfer_finalized_data = null;
  }

  setInMempool() { this.status = STATECOIN_STATUS.IN_MEMPOOL }
  setUnconfirmed() { this.status = STATECOIN_STATUS.UNCONFIRMED }
  setConfirmed() { this.status = STATECOIN_STATUS.AVAILABLE }
  setAwaitingSwap() { this.status = STATECOIN_STATUS.AWAITING_SWAP }
  setInSwap() { this.status = STATECOIN_STATUS.IN_SWAP }
  setInTransfer() { this.status = STATECOIN_STATUS.IN_TRANSFER; }
  setSpent() { this.status = STATECOIN_STATUS.SPENT; }
  setWithdrawn() { this.status = STATECOIN_STATUS.WITHDRAWN; }
  setSwapped() { this.status = STATECOIN_STATUS.SWAPPED; }
  setSpendPending() { this.status = STATECOIN_STATUS.SPEND_PENDING; }
  setExpired() { this.status = STATECOIN_STATUS.EXPIRED; }

  setBackupPreLocktime() { this.backup_status = BACKUP_STATUS.PRE_LOCKTIME }
  setBackupUnbroadcast() { this.backup_status = BACKUP_STATUS.UNBROADCAST }
  setBackupInMempool() { this.backup_status = BACKUP_STATUS.IN_MEMPOOL }
  setBackupConfirmed() { this.backup_status = BACKUP_STATUS.CONFIRMED }
  setBackupPostInterval() { this.backup_status = BACKUP_STATUS.POST_INTERVAL }
  setBackupTaken() { this.backup_status = BACKUP_STATUS.TAKEN }
  setBackupSpent() { this.backup_status = BACKUP_STATUS.SPENT }

  // Get data to display in GUI
  getDisplayInfo(block_height: number): StateCoinDisplayData {
    return {
      status: this.status,
      wallet_version: this.wallet_version,
      shared_key_id: this.shared_key_id,
      value: this.value,
      funding_txid: this.funding_txid,
      funding_vout: this.funding_vout,
      timestamp: this.timestamp,
      swap_rounds: this.swap_rounds,
      expiry_data: this.getExpiryData(block_height),
      transfer_msg: this.transfer_msg,
      swap_id: (this.swap_info ? this.swap_info.swap_token.id : null),
      swap_status: this.swap_status
    }
  };

  // Get data to display in GUI
  getSwapDisplayInfo(): SwapDisplayData | null {
    let si = this.swap_info;
    if (si === null){
      return null;
    }

    return {
      swap_status: this.swap_status,
      swap_id: si.swap_token.id,
      participants: si.swap_token.statechain_ids.length,
      capacity:si.swap_token.statechain_ids.length,
      status: si.status,
    }
  };

  getConfirmations(block_height: number): number {
    switch (this.status) {
      case (STATECOIN_STATUS.INITIALISED):
        return -1;
      case (STATECOIN_STATUS.IN_MEMPOOL):
        return 0;
      default:
        return block_height-this.block+1
    }
  }

  getFundingTxInfo(network: Network, block_height: number) {
    return {
      shared_key_id: this.shared_key_id,
      value: this.value,
      funding_txid: this.funding_txid,
      funding_vout: this.funding_vout,
      p_addr: this.getBtcAddress(network),
      confirmations: this.getConfirmations(block_height)
    }
  }

  getBackupTxData(block_height: number) {
    return {
      tx_backup_hex: this.tx_backup?.toHex(),
      priv_key_hex: "",
      key_wif: "",
      expiry_data: this.getExpiryData(block_height),
      backup_status: this.backup_status,
      txid: this.tx_backup?.getId(),
      output_value: this.tx_backup?.outs[0].value,
      cpfp_status: "None",
    }
  }

  // Calculate blocks and rough days/months until expiry
  // If not confirmed, send confirmation data instead.
  getExpiryData(block_height: number): ExpiryData {
    // If not confirmed, send confirmation data instead.
    if (this.tx_backup==null) {
      // Otherwise must be UNCONFIRMED so calculate number of confs
      return {blocks:-1, confirmations: this.getConfirmations(block_height), days:0, months:0};
    }

    let blocks_to_locktime = this.tx_backup.locktime - block_height;
    if (blocks_to_locktime<=0) return {blocks: 0, days: 0, months: 0, confirmations: 0};
    let days_to_locktime = Math.floor(blocks_to_locktime / (6*24))

    return {
      blocks: blocks_to_locktime,
      days: days_to_locktime,
      months: Math.floor(days_to_locktime/30),
      confirmations: 0
    }
  }

  // Get BTC address from SharedKey
  getBtcAddress(network: Network): string {
    let pub_key = this.getSharedPubKey()
    return pubKeyTobtcAddr(pub_key, network)
  }

  // Get public key from SharedKey
  getSharedPubKey(): string {
    return decodeSecp256k1Point(this.shared_key.public.q).encodeCompressed("hex");
  }

  // Set all StateCoin swap data to null.
  setSwapDataToNull() {
    this.setConfirmed();
    this.swap_status = null;
    this.swap_id = null
    this.swap_address = null;
    this.swap_info = null;
    this.swap_my_bst_data = null;
    this.swap_receiver_addr = null;
    this.swap_transfer_msg = null;
    this.swap_batch_data = null;
    this.swap_transfer_finalized_data = null;
  }
}

export interface StateCoinDisplayData {
  wallet_version: string,
  shared_key_id: string,
  value: number,
  funding_txid: string,
  funding_vout: number,
  timestamp: number,
  swap_rounds: number,
  expiry_data: ExpiryData,
  status: string,
  transfer_msg: TransferMsg3 | null,
  swap_id: string | null,
  swap_status: string | null,
}

export interface SwapDisplayData {
  swap_status: string | null,
  swap_id: string,
  participants: number,
  capacity: number,
  status: string,
}

export interface ExpiryData {
  blocks: number,
  days: number,
  months: number,
  confirmations: number
}


export interface InclusionProofSMT {

}
