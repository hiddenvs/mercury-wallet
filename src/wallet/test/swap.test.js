import {makeTesterStatecoin, SIGNSWAPTOKEN_DATA, COMMITMENT_DATA} from './test_data.js'
import {swapInit, swapPhase0, swapPhase1, SWAP_STATUS, SwapToken, make_swap_commitment} from "../swap/swap";
import {STATECOIN_STATUS} from '../statecoin'

import * as MOCK_SERVER from '../mocks/mock_http_client'

import {fromSeed} from 'bip32';

let bitcoin = require('bitcoinjs-lib')

// client side's mock
let wasm_mock = jest.genMockFromModule('../mocks/mock_wasm');
// server side's mock
let http_mock = jest.genMockFromModule('../mocks/mock_http_client');


describe('swapToken', function() {
  test('Gen and Verify', async function() {
    SIGNSWAPTOKEN_DATA.forEach(data => {
      let proof_key_der = bitcoin.ECPair.fromPrivateKey(Buffer.from(data.priv, "hex"));
      expect(proof_key_der.publicKey.toString('hex')).toBe(data.pub);
      let st = data.swap_token;
      let st_cls = new SwapToken(st.id, st.amount, st.time_out, st.statechain_ids);

      let swap_sig = st_cls.sign(proof_key_der,data.swap_token, data.priv);
      expect(swap_sig).toBe(data.swap_token_sig);
    })
  });

  describe('commitment', function() {
    test('Gen and Verify', async function() {
      wasm_mock.Commitment.make_commitment = jest.fn(() => JSON.stringify(COMMITMENT_DATA[0].batch_data));
       COMMITMENT_DATA.forEach(data => {
         let batch_data = make_swap_commitment(data.statecoin, data.swap_info, wasm_mock);
         expect(batch_data.commitment).toBe(data.batch_data.commitment);
       })
     });
  })
});

describe('Swaps', function() {
  test('swapInit', async function() {
    http_mock.post = jest.fn().mockReset()
      .mockReturnValueOnce()
    let statecoin = makeTesterStatecoin();
    let proof_key_der = bitcoin.ECPair.fromPrivateKey(Buffer.from(MOCK_SERVER.STATECOIN_PROOF_KEY_DER.__D));
    statecoin.status = STATECOIN_STATUS.AVAILABLE

    let init = await swapInit(http_mock, statecoin, proof_key_der, 10)
    expect(statecoin.swap_status).toBe(SWAP_STATUS.Phase0)

    // try again with swap_status != null
    await expect(swapInit(http_mock, statecoin, proof_key_der, 10))
      .rejects
      .toThrowError("Coin is already involved in a swap. Swap status: Phase0");
  })

  test('swapPhase0', async function() {
    let swap_id = "12345";
    http_mock.post = jest.fn().mockReset()
      .mockReturnValueOnce({id: null})    // return once null => swap has not started
      .mockReturnValueOnce({id: swap_id}) // return once an id => swap has begun

    let statecoin = makeTesterStatecoin();

    // try first without swap_status == Phase0
    statecoin.status = STATECOIN_STATUS.AWAITING_SWAP
    await expect(swapPhase0(http_mock, statecoin))
      .rejects
      .toThrowError("Coin is not yet in this phase of the swap protocol. In phase: null");

    // set swap_status as if coin had already run swapInit
    statecoin.swap_status = SWAP_STATUS.Phase0

    // swap not yet begun
    await swapPhase0(http_mock, statecoin)
    expect(statecoin.swap_status).toBe(SWAP_STATUS.Phase0)
    expect(statecoin.swap_id).toBe(null)
    // swap begun
    await swapPhase0(http_mock, statecoin)
    expect(statecoin.swap_status).toBe(SWAP_STATUS.Phase1)
    expect(statecoin.swap_id.id).toBe(swap_id)
  })

  test('swapPhase1', async function() {
    let swap_info = {
      status: SWAP_STATUS.Phase1,
      swap_token: { id: "12345", amount: 10, time_out: 15, statechain_ids: [] },
      bst_sender_data: {x: "1",q: {x:"1",y:"1"},k: "1",r_prime: {x:"1",y:"1"},}
    }
    http_mock.post = jest.fn().mockReset()
      .mockReturnValueOnce(null)    // return once null => swap has not started
      .mockReturnValueOnce(swap_info) // return once an id => swap has begun

    let statecoin = makeTesterStatecoin();
    let proof_key_der = bitcoin.ECPair.fromPrivateKey(Buffer.from(MOCK_SERVER.STATECOIN_PROOF_KEY_DER.__D));

    // try first without swap_status == Phase0
    statecoin.status = STATECOIN_STATUS.AWAITING_SWAP
    await expect(swapPhase1(http_mock, http_mock, wasm_mock, statecoin, proof_key_der, proof_key_der))
      .rejects
      .toThrowError("Coin is not in this phase of the swap protocol. In phase: null");

    // Set swap_status as if coin had already run Phase0
    statecoin.swap_status = SWAP_STATUS.Phase1

    await expect(swapPhase1(http_mock, http_mock, wasm_mock, statecoin, proof_key_der, proof_key_der))
      .rejects
      .toThrowError("No Swap ID found. Swap ID should be set in Phase0.");

    // Set swap_id as if coin had already run Phase0
    statecoin.swap_id = "12345"

    // swap token not yet available
    await swapPhase1(http_mock, http_mock, wasm_mock, statecoin, proof_key_der, proof_key_der)
    expect(statecoin.swap_status).toBe(SWAP_STATUS.Phase1)
    expect(statecoin.swap_address).toBe(null)
    expect(statecoin.swap_my_bst_data).toBe(null)
    // swap token available
    // await swapPhase1(http_mock, http_mock, wasm_mock, statecoin, proof_key_der, proof_key_der)
    // expect(statecoin.swap_address).toBe(SWAP_STATUS.Phase1)
    // expect(statecoin.swap_my_bst_data).toBe(swap_info)
  })
})
