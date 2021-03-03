import React, {useState} from 'react';
import {Link, withRouter} from "react-router-dom";

import MultiStep from "react-multistep";
import { CreateWizardForm, ConfirmSeed, DisplaySeed } from "../../components";

import './CreateWalletWizard.css'

let bip39 = require('bip39');

const mnemonic = bip39.generateMnemonic();

// MultiStep wizard for wallet setup
const CreateWizardPage = () => {

  const [wizardState, setWizardState] = useState(
    {
      wallet_name: "",
      mnemonic: mnemonic,
    });
  const setStateWalletName = (event) => setWizardState({...wizardState, wallet_name: event.target.value});

  const steps = [
    {component: <CreateWizardForm wizardState={wizardState} setStateWalletName={setStateWalletName}/>},
    {component: <DisplaySeed wizardState={wizardState}/>},
    {component: <ConfirmSeed wizardState={wizardState}/>}
  ];

  return (
    <div className="container wizard">
      <MultiStep steps={steps}/>
      <div className="btns">
        <Link to="/" >
          go back
        </Link>
      </div>
    </div>
  )
}

export default withRouter(CreateWizardPage);
