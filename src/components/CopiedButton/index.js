import React, { cloneElement, useState, useEffect } from "react";
import PropTypes from "prop-types";
import "./copiedButton.css";

let timeout;

function CopiedButton ({ 
  children, 
  handleCopy, 
  style = {}, 
  message = 'Copied!',
  delay = 1000
}) {
  const [copied, setCopied] = useState(false);
  const handleClick = (e) => {
    handleCopy(e)
    setCopied(true)
  };
  useEffect(() => {
    clearTimeout(timeout);
    timeout = setTimeout(() => setCopied(false), delay);
    return () => clearTimeout(timeout);
  });
  return (
    <div className="copy-btn-wrap">
      {copied && <span className="copied" style={style}>{message}</span>}
      {cloneElement(children, { onClick: handleClick })}
    </div>
  );
};

CopiedButton.propTypes = {
  children: PropTypes.element,
  handleCopy: PropTypes.func,
  style: PropTypes.object,
  delay: PropTypes.number,
  message: PropTypes.string
};

export default CopiedButton;
