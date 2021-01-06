import { TransactionBuilder, crypto, networks } from 'bitcoinjs-lib';
import { FEE_INFO } from '../mocks/mock_http_client';
import { FEE, txBackupBuild, txWithdrawBuild, StateChainSig,
  encodeSCEAddress, decodeSCEAddress, encodeSecp256k1Point, decodeSecp256k1Point } from '../util';
import { FUNDING_TXID, BTC_ADDR, SIGNSTATECHAIN_DATA } from './test_data.js'

let bip32 = require('bip32');
let bitcoin = require('bitcoinjs-lib');


describe('signStateChain', function() {
  let proof_key_der = bip32.fromSeed(Buffer.from("0123456789abcdef"), networks.bitcoin)

  test('Gen and Verify', async function() {
    SIGNSTATECHAIN_DATA.forEach(data => {
      let statechain_sig = StateChainSig.create(proof_key_der, data.purpose, data.data);
      expect(statechain_sig.sig).toBe(data.sig);
      expect(statechain_sig.verify(proof_key_der)).toBe(true)
    })
  });
})

describe('txBackupBuild', function() {
    let network = networks.bitcoin;
    let funding_txid = FUNDING_TXID;
    let backup_receive_addr = BTC_ADDR
    let value = 10000;
    let locktime = 100;

  test('txBackupBuild throw on value < fee', async function() {
    expect(() => {  // not enough value
      txBackupBuild(network, funding_txid, backup_receive_addr, 100, locktime);
    }).toThrowError('Not enough value to cover fee.');
  });

  test('Check built tx correct', async function() {
    let tx_backup = txBackupBuild(network, funding_txid, backup_receive_addr, value, locktime).buildIncomplete();
    expect(tx_backup.ins.length).toBe(1);
    expect(tx_backup.ins[0].hash.reverse().toString("hex")).toBe(funding_txid);
    expect(tx_backup.outs.length).toBe(1);
    expect(tx_backup.outs[0].value).toBeLessThan(value);
    expect(tx_backup.locktime).toBe(locktime);
  });
});

describe('txWithdrawBuild', function() {
  let network = networks.bitcoin;
  let funding_txid = FUNDING_TXID;
  let rec_address = BTC_ADDR
  let value = 10000;
  let fee_info = FEE_INFO

  test('Throw on invalid value', async function() {
    expect(() => {  // not enough value
      txWithdrawBuild(network, funding_txid, rec_address, 0, fee_info);
    }).toThrowError('Not enough value to cover fee.');
    expect(() => {  // not enough value
      txWithdrawBuild(network, funding_txid, rec_address, Number(fee_info.withdraw), fee_info); // should be atleast + value of network FEE also
    }).toThrowError('Not enough value to cover fee.');
  });

  test('Check built tx correct', async function() {
    let tx_backup = txWithdrawBuild(network, funding_txid, rec_address, value, fee_info).buildIncomplete();
    expect(tx_backup.ins.length).toBe(1);
    expect(tx_backup.ins[0].hash.reverse().toString("hex")).toBe(funding_txid);
    expect(tx_backup.outs.length).toBe(2);
    expect(tx_backup.outs[0].value).toBe(value-Number(fee_info.withdraw)-FEE);
    expect(tx_backup.outs[1].value).toBe(Number(fee_info.withdraw));
  });
});

test('bech32 encode/decode', function() {
  let proof_key = BTC_ADDR;
  let encode = encodeSCEAddress(proof_key);
  expect(encode.slice(0,2)).toBe("sc");
  let decode = decodeSCEAddress(encode);
  expect(proof_key).toBe(decode);
});

test('Secp256k Point encode/decode', async function() {
  let bip32 = bitcoin.ECPair.makeRandom({compressed: false});
  let publicKey = bip32.publicKey;

  let encoded = encodeSecp256k1Point(publicKey);
  let decoded = decodeSecp256k1Point(encoded);
  expect(publicKey).toStrictEqual(decoded);
});
