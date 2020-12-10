import React from 'react';
import { useDispatch } from 'react-redux'
import { useSelector } from 'react-redux'

import { addCoin, removeCoin } from '../../features/CoinDataSlice'
import { deposit, getRoot, getFeeInfo } from '../../wallet'
import { Wallet, Statecoin, verifySmtProof } from '../../wallet'
import walletIcon from '../../images/walletIcon.png';
import walletIconSmall from '../../images/walletIconsmallIcon.png';
import pluseIcon from '../../images/pluseIcon.png';
import swapIcon from '../../images/swap-icon.png';
import arrowUp from '../../images/arrow-up.png';
import arrowDown from '../../images/arrow-down.png';

import StdButton from '../buttons/standardButton';

import './panelControl.css';
import '../index.css';
import { Link } from "react-router-dom";
import settings from "../../images/settings-icon.png";

const PanelControl = () => {
  const dispatch = useDispatch()
  const totalAmount = useSelector(state => state.coinData.total_amount)

  const createButtonAction = async () => {
    // let root = "[149,77,135,96,114,71,131,121,205,171,129,110,105,245,141,41,213,54,72,34,212,10,180,230,59,61,166,28,80,68,2,188]"
    // let proof_key = "03b971d624567214a2e9a53995ee7d4858d6355eb4e3863d9ac540085c8b2d12b3"
    // let sc_smt_proof1 = "[[false,[0,0,1,0,99,49,53,54,50,102,55,102,49,53,100,54,98,56,97,53,49,101,97,50,101,55,48,51,53,98,57,99,100,98,56,99,0]]]"
    // verifySmtProof(root, proof_key, sc_smt_proof1).then(res => {
    //   console.log(res)
    // })
    const wallet = Wallet.buildMock()
    deposit(wallet)
    // let amount = 0.1; // value should be provided via props
    // let deposit_data = Deposit(amount);
    // console.log(deposit_data);
    // dispatch(
    //   addCoin({
    //     id: deposit_data.state_chain_id,
    //     amount: amount,
    //     time_left: deposit_data.time_left,
    //     funding_txid: deposit_data.funding_txid,
    //   })
    // )
  }

  const withdrawButtonAction = () => {
    let state_chain_id = "57307393-d35c-438c-87dc-d06054277a5d";
    // let withdraw_data = Withdraw(state_chain_id);
    // console.log(withdraw_data);
    // dispatch(
    //   removeCoin()
    // )
  }

  const swapButtonAction = () => {
    let state_chain_id = "57307393-d35c-438c-87dc-d06054277a5d";
    let swap_size = 10;
    let anon_score = 0;
    // let swap_data = Swap(state_chain_id, swap_size, anon_score);
    // console.log(swap_data)
    // dispatch( // rm old coin
    //   removeCoin()
    // )
    // dispatch( // replace with new
    //   addCoin({
    //     id: swap_data.state_chain_id,
    //     amount: swap_data.amount,
    //     time_left: swap_data.time_left,
    //     funding_txid: swap_data.funding_txid,
    //   })
    // )
  }

  const sendButtonAction = () => {
    let state_chain_id = "57307393-d35c-438c-87dc-d06054277a5d";
    let receiver_addr = "026ff25fd651cd921fc490a6691f0dd1dcbf725510f1fbd80d7bf7abdfef7fea0ebcrt1qq0znj64a5zukv7yew52zjzmdndch3r0vxu8668";
    // let transfer_data = TransferSender(state_chain_id, receiver_addr);
    // console.log(transfer_data);
    dispatch(
      removeCoin()
    )
  }

  const receiveButtonAction = () => {
    let receiver_msg = "receivermessage3fd1524b966044187430afb44a7edfee4";
    // let transfer_data = TransferReceiver(receiver_msg);
    // console.log(transfer_data)
    // dispatch(
    //   addCoin({
    //     id: transfer_data.state_chain_id,
    //     amount: transfer_data.amount,
    //     time_left: transfer_data.time_left,
    //     funding_txid: transfer_data.funding_txid,
    //   })
    // )
  }


  return (
    <div className="Body">
      <h2 className="WalletAmount">
          <img src={walletIcon} alt="walletIcon"/>
          {totalAmount} BTC
      </h2>
        <div className="no-wallet">
            <span>No Statecoins in Wallet</span>
        </div>
      <div className="ButtonsPanel">
        <div className="ActionGroupLeft">


                <Link className="nav-link" to="/deposit">
                    <StdButton
                        label="Deposit"  icon={pluseIcon}
                        onClick={createButtonAction}
                        className="Body-button blue"/>
                </Link>



          <Link className="nav-link" to="/swap_statecoin">

            <StdButton
                label="Swap" icon={swapIcon}
                onClick={swapButtonAction}
                className="Body-button blue"/>
          </Link>

          <StdButton
            label="Withdraw" icon={walletIconSmall}
            onClick={withdrawButtonAction}
            className="Body-button yellow"/>
        </div>
        <div className="ActionGroupRight">
          <StdButton
            label="Send" icon={arrowUp}
            onClick={sendButtonAction}
            className="Body-button "/>
          <StdButton
            label="Receive" icon={arrowDown}
            onClick={receiveButtonAction}
            className="Body-button"/>
        </div>
      </div>
    </div>
  );
}

export default PanelControl;