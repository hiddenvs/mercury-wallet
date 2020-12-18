// Withdraw

import { BIP32Interface, Network, Transaction } from "bitcoinjs-lib";
import { getFeeInfo, post, POST_ROUTE, StateCoin } from "..";
import { signStateChain, txWithdrawBuild } from "../util";
import { PROTOCOL, sign } from "./ecdsa";
import { FeeInfo } from "./info_api";

// withdraw() messages:
// 0. request withdraw and provide withdraw tx data
// 1. Sign state chain and request withdrawal
// 2. Co-sign withdraw tx
// 3. Broadcast withdraw tx




// Withdraw coins from state entity. Returns signed withdraw transaction
export const withdraw = async (network: Network, statecoin: StateCoin, proof_key_der: BIP32Interface, rec_address: string) => {
  // Sign statecoin to signal desire to Withdraw
  let state_chain_sig = signStateChain(proof_key_der, "WITHDRAW", rec_address);

  // Alert SE of desire to withdraw and receive authorisation if state chain signature verifies
  let withdraw_msg_1 = {
      shared_key_id: statecoin.shared_key_id,
      statechain_sig: state_chain_sig
  }
  await post(POST_ROUTE.WITHDRAW_INIT, withdraw_msg_1);

  // Get state entity fee info
  let fee_info: FeeInfo = await getFeeInfo();

  // Construct withdraw tx
  let txb_withdraw_unsigned = txWithdrawBuild(
    network,
    statecoin.funding_txid,
    rec_address,
    (statecoin.value + fee_info.deposit),
    fee_info
  );
  let tx_withdraw_unsigned = txb_withdraw_unsigned.buildIncomplete();

  // tx_withdraw_unsigned
  let signatureHash = tx_withdraw_unsigned.hashForSignature(0, tx_withdraw_unsigned.ins[0].script, Transaction.SIGHASH_ALL);
  let signature = await sign(statecoin.shared_key_id, statecoin.shared_key, signatureHash.toString('hex'), PROTOCOL.DEPOSIT);
  // set witness data with signature
  let tx_backup_signed = tx_withdraw_unsigned;
  tx_backup_signed.ins[0].witness = [Buffer.from(signature)];

  return tx_backup_signed
}