import anon_icon_none from "../../images/table-icon-grey.png";
import anon_icon_low from "../../images/table-icon-medium.png";
import anon_icon_high from "../../images/table-icon.png";
import anon_icon2_none from "../../images/close-grey.png";
import anon_icon2_low from "../../images/question-mark.png";
import anon_icon2_high from "../../images/check-grey.png";
import utx from "../../images/UTX.png";
import time from "../../images/time-grey.png";
import calendar from "../../images/calendar.png";
import swapNumber from "../../images/swap-number.png";
import walleticon from "../../images/walletIcon.png";
import txidIcon from "../../images/txid-icon.png";
import timeIcon from "../../images/time.png";

import React, {useState, useEffect} from 'react';
import ProgressBar from 'react-bootstrap/ProgressBar'
import {Button, Modal} from 'react-bootstrap';
import {useDispatch, useSelector} from 'react-redux';
import Moment from 'react-moment';

import {fromSatoshi} from '../../wallet/util'
import {callGetUnspentStatecoins, updateBalanceInfo, callGetUnconfirmedStatecoinsDisplayData} from '../../features/WalletDataSlice'
import SortBy from './SortBy/SortBy'
import { STATECOIN_STATUS } from '../../wallet/statecoin'
import { CoinStatus } from '../../components'

import './coins.css';
import '../index.css';

const DEFAULT_STATE_COIN_DETAILS = {show: false, coin: {value: 0, expiry_data: {blocks: "", months: "", days: ""}, privacy_data: {score_desc: ""}}}
// privacy score considered "low"
const LOW_PRIVACY = 10
// style time left timer as red after this many months
const MONTHS_WARNING = 5

const INITIAL_COINS = {
    unspentCoins: [],
    unConfirmedCoins: []
}

const INITIAL_SORT_BY = {
	direction: 0,
	by: 'value'
};

const Coins = (props) => {
    const dispatch = useDispatch();
    const { filterBy } = useSelector(state => state.walletData);

  	const [sortCoin, setSortCoin] = useState(INITIAL_SORT_BY);
    const [coins, setCoins] = useState(INITIAL_COINS);
    const [showCoinDetails, setShowCoinDetails] = useState(DEFAULT_STATE_COIN_DETAILS);  // Display details of Coin in Modal
    const handleOpenCoinDetails = (shared_key_id) => {
        let coin = all_coins_data.find((coin) => {
            return coin.shared_key_id === shared_key_id
        })
        coin.privacy_data = getPrivacyScoreDesc(coin.swap_rounds);
        setShowCoinDetails({show: true, coin: coin});
    }
    const handleCloseCoinDetails = () => {
        props.setSelectedCoin(null);
        setShowCoinDetails(DEFAULT_STATE_COIN_DETAILS);
    }

    const filterCoinsByStatus = (coins = [], status) => {
      return coins.filter(coin => coin.status === status);
    }
    // Set selected coin
    const selectCoin = (shared_key_id) => {
        shared_key_id === props.selectedCoin ? props.setSelectedCoin(null) : props.setSelectedCoin(shared_key_id);
        if (props.displayDetailsOnClick) {
            handleOpenCoinDetails(shared_key_id)
        }
    }

    // Check if coin is selected. If so return CSS.
    const isSelectedStyle = (shared_key_id) => {
        return props.selectedCoin === shared_key_id ? {backgroundColor: "#e6e6e6"} : {}
    }

    // Convert expiry_data to string displaying months or days left
    const expiry_time_to_string = (expiry_data) => {
        return expiry_data.months > 0 ? expiry_data.months + " months" : expiry_data.days + " days"
    }

    //Load coins once component done render
    useEffect(() => {
      const [coins_data, total_balance] = callGetUnspentStatecoins();
      let unconfired_coins_data = callGetUnconfirmedStatecoinsDisplayData();
      setCoins({
          unspentCoins: coins_data,
          unConfirmedCoins: unconfired_coins_data
      })
      // Update total_balance in Redux state
      if(filterBy !== 'default') {
        const coinsByStatus = filterCoinsByStatus([...coins_data, ...unconfired_coins_data], filterBy);
        const total = coinsByStatus.reduce((sum, currentItem) => sum + currentItem.value , 0);
        dispatch(updateBalanceInfo({total_balance: total, num_coins: coinsByStatus.length}));
      } else {
        const coinsNotWithdraw = coins_data.filter(coin => coin.status !== STATECOIN_STATUS.WITHDRAWN)
        const total = coinsNotWithdraw.reduce((sum, currentItem) => sum + currentItem.value , 0);
        dispatch(updateBalanceInfo({total_balance: total, num_coins: coinsNotWithdraw.length}));
      }
    }, [props.refresh, filterBy]);

    // Re-fetch every 10 seconds and update state to refresh render
    // IF any coins are marked UNCONFIRMED
    useEffect(() => {
      if (coins.unConfirmedCoins.length) {
        const interval = setInterval(() => {
          let new_unconfired_coins_data = callGetUnconfirmedStatecoinsDisplayData();
          // check for change in length of unconfirmed coins list and total number
          // of confirmations in unconfirmed coins list
          if (
            coins.unConfirmedCoins.length !== new_unconfired_coins_data.length
              ||
            coins.unConfirmedCoins.reduce((acc, item) => acc+item.expiry_data.confirmations,0)
              !==
            new_unconfired_coins_data.reduce((acc, item) => acc+item.expiry_data.confirmations,0)
          ) {
            setCoins({
                ...coins,
                unConfirmedCoins: new_unconfired_coins_data
            })
          }
        }, 10000);
        return () => clearInterval(interval);
      }
    }, [coins.unConfirmedCoins]);

    // data to display in privacy related sections
    const getPrivacyScoreDesc = (swap_rounds) => {
      if (!swap_rounds) {
        return {
          icon1: anon_icon_none,
          icon2: anon_icon2_none,
          score_desc: "No Privacy Score",
          msg: "Withdrawn BTC will have no privacy"
        }
      }
      if (swap_rounds < LOW_PRIVACY) {
        return {
          icon1: anon_icon_low,
          icon2: anon_icon2_low,
          score_desc: "Low Privacy Score",
          msg: "Withdrawn BTC will have low privacy"
        }
      }
      return {
        icon1: anon_icon_high,
        icon2: anon_icon2_high,
        score_desc: "High Privacy Score",
        msg: "Withdrawn BTC will be private"
      }
    }

    let all_coins_data = [...coins.unspentCoins, ...coins.unConfirmedCoins];

    // Filter coins by status
    if(filterBy === 'default') {
      all_coins_data = all_coins_data.filter(coin => coin.status !== STATECOIN_STATUS.WITHDRAWN)
    } else {
      if(filterBy === STATECOIN_STATUS.WITHDRAWN) {
        all_coins_data = filterCoinsByStatus(all_coins_data, STATECOIN_STATUS.WITHDRAWN);
      }
      if(filterBy === STATECOIN_STATUS.IN_TRANSFER) {
        all_coins_data = filterCoinsByStatus(all_coins_data, STATECOIN_STATUS.IN_TRANSFER);
      }
    }

  	all_coins_data.sort((a, b) => {
  		let compareProp = sortCoin.by;
  		if(compareProp === 'expiry_data') {
  			a = (parseInt(a[compareProp]['months']) * 30) + parseInt(a[compareProp]['days']);
  			b = (parseInt(b[compareProp]['months']) * 30) + parseInt(b[compareProp]['days']);
  		} else {
  			a = a[compareProp];
  			b = b[compareProp];
  		}
  		if(a > b) {
  			return sortCoin.direction ? 1 : -1;
  		} else if (a < b) {
  			return sortCoin.direction ? -1 : 1;
  		}
  		return 0;
  	});

    const statecoinData = all_coins_data.map(item => {
      item.privacy_data = getPrivacyScoreDesc(item.swap_rounds);

    return (
        <div key={item.shared_key_id}>
          <div
              onClick={() => selectCoin(item.shared_key_id)}
              style={isSelectedStyle(item.shared_key_id)}>

                <div className="CoinPanel">
                  <div className="CoinAmount-block">
                      <img src={item.privacy_data.icon1} alt="icon"/>
                      <span className="sub">
                          <b className="CoinAmount">  {fromSatoshi(item.value)} BTC</b>
                          <div className="scoreAmount">
                              <img src={item.privacy_data.icon2} alt="icon"/>
                              {item.privacy_data.score_desc}
                              <span className="tooltip">
                                  <b>{item.privacy_data.score_desc}:</b>
                                    {item.privacy_data.msg}
                              </span>
                          </div>
                      </span>
                  </div>
                  {filterBy !== STATECOIN_STATUS.WITHDRAWN ? (
                    <div className="progress_bar" id={item.expiry_data.months < MONTHS_WARNING ? 'danger' : 'success'}>
                        <div className="sub">
                            <ProgressBar>
                                <ProgressBar striped variant={item.expiry_data.months < MONTHS_WARNING ? 'danger' : 'success'}
                                  now={item.expiry_data.months * 100 / 12}
                                  key={1}/>
                            </ProgressBar>
                        </div>
                        <div className="CoinTimeLeft">
                            <img src={timeIcon} alt="icon"/>
                            <span>
                                Time Until Expiry: <span className='expiry-time-left'>{expiry_time_to_string(item.expiry_data)}</span>
                            </span>
                        </div>
                    </div>
                  ) : (
                    <div className="widthdrawn-status">
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M8 0.5C3.875 0.5 0.5 3.875 0.5 8C0.5 12.125 3.875 15.5 8 15.5C12.125 15.5 15.5 12.125 15.5 8C15.5 3.875 12.125 0.5 8 0.5ZM12.875 9.125H3.125V6.875H12.875V9.125Z" fill="#BDBDBD"/>
                      </svg>
                      <span>
                        Withdrawn <span className="widthdrawn-status-time">| {<Moment format="MM.DD.YYYY HH:mm">{item.timestamp}</Moment>}</span>
                      </span>
                    </div>
                  )}

                {props.showCoinStatus ? (
                  <div className="coin-status-or-txid">
                    {(item.status === STATECOIN_STATUS.AVAILABLE || item.status === STATECOIN_STATUS.WITHDRAWN) ?
                    (
                      <b className="CoinFundingTxid">
                          <img src={txidIcon} alt="icon"/>
                          {item.funding_txid}
                      </b>
                    )
                    : <CoinStatus data={item} />}
                  </div>
                ) : (
                  <b className="CoinFundingTxid">
                    <img src={txidIcon} alt="icon"/>
                    {item.funding_txid}
                  </b>
                )}
              </div>
          </div>
        </div>
    )})

    return (
        <div>
          {(all_coins_data.length && filterBy !== STATECOIN_STATUS.WITHDRAWN) ? <SortBy sortCoin={sortCoin} setSortCoin={setSortCoin} /> : null }
            {statecoinData}

            <Modal show={showCoinDetails.show} onHide={handleCloseCoinDetails} className="modal">
                <Modal.Body>
                    <div>
                        <div className="item">
                            <img src={walleticon} alt="icon"/>
                            <div className="block">
                                <span>Statecoin Value</span>
                                <span>
                                    <b>{fromSatoshi(showCoinDetails.coin.value)} BTC</b>
                                </span>
                            </div>
                        </div>
                        <div className="item">
                          <CoinStatus data={showCoinDetails.coin} isDetails={true} />
                        </div>
                        <div className="item">
                            <img src={utx} alt="icon"/>
                            <div className="block">
                                <span>UTXO ID:</span>
                                <span>{showCoinDetails.coin.funding_txid}</span>
                            </div>
                        </div>
                        <div className="item">
                            <img src={time} alt="icon"/>
                            <div className="block">
                                <span>
                                  Time Until Expiry: {expiry_time_to_string(showCoinDetails.coin.expiry_data)}
                                </span>
                                <span></span>
                            </div>
                        </div>
                        <div className="item">
                            <img src={calendar} alt="icon"/>
                            <div className="block">
                                <span>Date Created</span>
                                <span>
                                  {new Date(showCoinDetails.coin.timestamp).toUTCString()}
                                </span>
                            </div>
                        </div>
                        <div className="item">
                            <img src={showCoinDetails.coin.privacy_data.icon1} alt="icon"/>

                            <div className="block">
                                <span>Privacy Score</span>
                                <span>{showCoinDetails.coin.privacy_data.score_desc}</span>

                            </div>
                        </div>
                        <div className="item">
                            <img src={swapNumber} alt="icon"/>
                            <div className="block">
                                <span>Number of Swaps Rounds</span>
                                <span>Swaps: {showCoinDetails.coin.swap_rounds}
                                  {/*
                                    <br/>
                                    Number of Participants: 0
                                  */}
                                </span>
                            </div>
                        </div>
                    </div>

                </Modal.Body>
                <Modal.Footer>
                    <Button variant="secondary" onClick={handleCloseCoinDetails}>
                        Close
                    </Button>

                </Modal.Footer>
            </Modal>
        </div>
    );
}

export default Coins;
