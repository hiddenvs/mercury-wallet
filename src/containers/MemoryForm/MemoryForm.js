import React, {useRef} from 'react';
import  './MemoryForm.css'
import {Link} from "react-router-dom";




const MemoryForm = () => {


    return (
    <div className="memory-form">
        <form>

            <div className="inputs-item">
                <input id="Name" type="text" name="Wallet Name" placeholder="Wallet Name"
                       required/>

            </div>


            <div className="inputs-item">
                <input id="Passphrase" type="password" name="password" required placeholder="Passphrase "
                      />

            </div>
            <Link  to="/home" >
                Send
            </Link>



        </form>


    </div>
  )
}

export default MemoryForm;