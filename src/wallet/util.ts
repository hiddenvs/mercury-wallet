// wallet utilities

import { BIP32Interface, Network, TransactionBuilder, crypto as crypto_btc, script, Transaction } from 'bitcoinjs-lib';
import { Root } from './mercury/info_api';
import { Secp256k1Point } from './mercury/transfer';
import { TransferMsg3 } from './mercury/transfer';


import { encrypt, decrypt } from 'eciesjs'
import { segwitAddr } from './wallet';

let bech32 = require('bech32')
let bitcoin = require('bitcoinjs-lib')
let typeforce = require('typeforce');
let types = require("./types")
let crypto = require('crypto');

let EC = require('elliptic').ec
let secp256k1 = new EC('secp256k1')
var msgpack = require("msgpack-lite");

/// Temporary - fees should be calculated dynamically
export const FEE = 300;

// Verify Spase Merkle Tree proof of inclusion
export const verifySmtProof = async (wasm_client: any, root: Root, proof_key: string, proof: any) => {
  typeforce(typeforce.oneOf(types.Root, typeforce.Null), root);
  return wasm_client.verify_statechain_smt(JSON.stringify(root.value), proof_key, JSON.stringify(proof));
}

export const pubKeyTobtcAddr = (pub_key: string, network: Network) => {
  return segwitAddr({publicKey: Buffer.from(pub_key, "hex")}, network)
}

export const pubKeyToScriptPubKey = (pub_key: string, network: Network) => {
  return bitcoin.address.toOutputScript(pubKeyTobtcAddr(pub_key, network), network)
}

export const proofKeyToSCEAddress = (proof_key: string, network: Network) => {
  return {
    tx_backup_addr: pubKeyTobtcAddr(proof_key, network),
    proof_key: proof_key
  }
}

export const hexToBytes = (hex: string) => {
    for (var bytes = [], c = 0; c < hex.length; c += 2)
    bytes.push(parseInt(hex.substr(c, 2), 16));
    return bytes;
}

// BTC value -> Satoshi value
export const toSatoshi = (btc: number) => { return btc * 10e7 }
// Satoshi value -> BTC value
export const fromSatoshi = (sat: number) => { return sat / 10e7 }

export class StateChainSig {
    purpose: string; // "TRANSFER", "TRANSFER-BATCH" or "WITHDRAW"
    data: string;    // proof key, state chain id or address
    sig: string;

    constructor(purpose: string, data: string, sig: string) {
      this.purpose = purpose;
      this.data = data;
      this.sig = sig;
    }

    static create(
      proof_key_der: BIP32Interface,
      purpose: string,
      data: string
    ): StateChainSig {
      let statechain_sig = new StateChainSig(purpose, data, "");
      let hash = statechain_sig.to_message();
      let sig = proof_key_der.sign(hash, false);

      // Encode into bip66 and remove hashType marker at the end to match Server's bitcoin::Secp256k1::Signature construction.
      let encoded_sig = script.signature.encode(sig,1);
      encoded_sig = encoded_sig.slice(0, encoded_sig.length-1);
      statechain_sig.sig = encoded_sig.toString("hex");

      return statechain_sig
    }

    // Make StateChainSig message. Concat purpose string + data and sha256 hash.
    to_message(): Buffer {
      let buf = Buffer.from(this.purpose + this.data, "utf8")
      return crypto_btc.sha256(buf)
    }

    // Verify self's signature for transfer or withdraw
    verify(proof_key_der: BIP32Interface): boolean {
      let proof = Buffer.from(this.sig, "hex");
      // Re-insert hashType marker ("01" suffix) and decode from bip66
      proof = Buffer.concat([proof, Buffer.from("01", "hex")]);
      let decoded = script.signature.decode(proof);

      let hash = this.to_message();
      return proof_key_der.verify(hash, decoded.signature);
    }

    /// Generate signature to request participation in a batch transfer
      static new_transfer_batch_sig(
          proof_key_der: BIP32Interface,
          batch_id: string,
          statechain_id: string,
      ): StateChainSig {
          let purpose = this.purpose_transfer_batch(batch_id); 
          let statechain_sig = StateChainSig.create(proof_key_der,purpose, statechain_id);
          return statechain_sig;
      }

      static purpose_transfer_batch(batch_id: string):string{
        let buf =  "TRANSFER_BATCH:" + batch_id;
        return buf;
      }

}

export const getSigHash = (tx: Transaction, index: number, pk: string, amount: number, network: Network): string => {
  let addr_p2pkh = bitcoin.payments.p2pkh({
    pubkey: Buffer.from(pk, "hex"),
    network: network
  }).address;
  let script = bitcoin.address.toOutputScript(addr_p2pkh, network);

  return tx.hashForWitnessV0(index, script, amount, Transaction.SIGHASH_ALL).toString("hex");
}

// Backup Tx builder
export const txBackupBuild = (network: Network, funding_txid: string, funding_vout: number, backup_receive_addr: string, value: number, fee_address: string, withdraw_fee: number, init_locktime: number): TransactionBuilder => {
  if (FEE+withdraw_fee >= value) throw Error("Not enough value to cover fee.");

  let txb = new TransactionBuilder(network);
  txb.setLockTime(init_locktime);
  txb.addInput(funding_txid, funding_vout, 0xFFFFFFFE);
  txb.addOutput(backup_receive_addr, value - FEE - withdraw_fee);
  txb.addOutput(fee_address, withdraw_fee);
  return txb
}

// Withdraw tx builder spending funding tx to:
//     - amount-fee to receive address, and
//     - amount 'fee' to State Entity fee address
export const txWithdrawBuild = (network: Network, funding_txid: string, funding_vout: number, rec_address: string, value: number, fee_address: string, withdraw_fee: number): TransactionBuilder => {
  if (withdraw_fee + FEE >= value) throw Error("Not enough value to cover fee.");

  let txb = new TransactionBuilder(network);

  txb.addInput(funding_txid, funding_vout, 0xFFFFFFFF);
  txb.addOutput(rec_address, value - FEE - withdraw_fee);
  txb.addOutput(fee_address, withdraw_fee);
  return txb
}

// CPFP tx builder spending backup tx to user specified address
export const txCPFPBuild = (network: Network, funding_txid: string, funding_vout: number, rec_address: string, value: number, fee_rate: number, p2wpkh: any): TransactionBuilder => {
  // Total size of backup_tx (1 input 2 outputs) + 1-input-1-output = 140 + 110 bytes
  // Subtract the fee already paid in the backup-tx
  let total_fee = (fee_rate * 250) - FEE;

  if (total_fee >= value) throw Error("Not enough value to cover fee.");

  let txb = new TransactionBuilder(network);

  txb.addInput(funding_txid, funding_vout, 0xFFFFFFFF, p2wpkh.output);
  txb.addOutput(rec_address, value - total_fee);
  return txb
}

// Bech32 encode SCEAddress (StateChain Entity Address)
export const encodeSCEAddress = (proof_key: string) => {
  let words = bech32.toWords(Buffer.from(proof_key, 'hex'))
  return bech32.encode('sc', words)
}

// Bech32 decode SCEAddress
export const decodeSCEAddress = (sce_address: string): string => {
  let decode =  bech32.decode(sce_address)
  return Buffer.from(bech32.fromWords(decode.words)).toString('hex')
}

// Bech32 encode transfer message
export const encodeMessage = (message: TransferMsg3) => {
  let buffer = msgpack.encode(message);
  let words = bech32.toWords(buffer)
  return bech32.encode('mm', words, 6000)
}

// Bech32 decode transfer message
export const decodeMessage = (enc_message: string): TransferMsg3 => {
  let decode =  bech32.decode(enc_message, 6000);
  let buf = Buffer.from(bech32.fromWords(decode.words))
  return msgpack.decode(buf)
}

// encode Secp256k1Point to {x: string, y: string}
export const encodeSecp256k1Point = (publicKey: string): {x: string, y: string} => {
  let decoded_pub = secp256k1.curve.decodePoint(Buffer.from(publicKey, 'hex'));
  return { x: decoded_pub.x.toString("hex"), y: decoded_pub.y.toString("hex") }
}

// decode Secp256k1Point to secp256k1.curve.point Buffer
export const decodeSecp256k1Point = (point: Secp256k1Point) => {
  let p = secp256k1.curve.point(point.x, point.y);
  return p;
}

const zero_pad = (num: any) => {
    var pad = '0000000000000000000000000000000000000000000000000000000000000000';
    return (pad + num).slice(-pad.length);
}

// ECIES encrypt string
export const encryptECIESt2 = (publicKey: string, data: string): Buffer => {
  let data_arr = new Uint32Array(Buffer.from(zero_pad(data), "hex")); // JSONify to match Mercury ECIES
  return encrypt(publicKey, Buffer.from(data_arr));
}

// ECIES encrypt string
export const encryptECIES = (publicKey: string, data: string): Buffer => {
  let data_arr = new Uint32Array(Buffer.from(JSON.stringify(data))) // JSONify to match Mercury ECIES
  return encrypt(publicKey, Buffer.from(data_arr));
}

// ECIES decrypt string
export const decryptECIES = (secret_key: string, encryption: string): {} => {
  let enc = new Uint32Array(Buffer.from(encryption, "hex"))
  let dec = decrypt(secret_key, Buffer.from(enc)).toString();
  return JSON.parse(dec)  // un-JSONify
}

// ECIES decrypt string x1 from Server.
export const decryptECIESx1 = (secret_key: string, encryption: string): string => {
  let enc = new Uint32Array(Buffer.from(encryption, "hex"))
  let dec = decrypt(secret_key, Buffer.from(enc));
  return dec.toString("hex")  // un-JSONify
}


const AES_ALGORITHM = 'aes-192-cbc';
const PBKDF2_HASH_ALGORITHM = 'sha512';
const PBKDF2_NUM_ITERATIONS = 2000;

export interface EncryptionAES {
  iv: string,
  encryption: string
}

// AES encrypt with password
export const encryptAES = (data: string, password: string): EncryptionAES => {
  const key = crypto.pbkdf2Sync(password, 'salt', PBKDF2_NUM_ITERATIONS, 24, PBKDF2_HASH_ALGORITHM);
  let iv = crypto.randomFillSync(new Uint8Array(16))
  const cipher = crypto.createCipheriv(AES_ALGORITHM, key, iv);

  let encrypted = cipher.update(data, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  return {
    iv: Buffer.from(iv).toString("hex"),
    encryption: encrypted
  }
}

// AES decrypt with password
export const decryptAES = (encryption: EncryptionAES, password: string) => {
  const key = crypto.pbkdf2Sync(password, 'salt', PBKDF2_NUM_ITERATIONS, 24, PBKDF2_HASH_ALGORITHM);
  const decipher = crypto.createDecipheriv(AES_ALGORITHM, key, Buffer.from(encryption.iv, "hex"));

  let decrypted = decipher.update(encryption.encryption, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted
}
