/*
 This file is part of web3.js.

 web3.js is free software: you can redistribute it and/or modify
 it under the terms of the GNU Lesser General Public License as published by
 the Free Software Foundation, either version 3 of the License, or
 (at your option) any later version.

 web3.js is distributed in the hope that it will be useful,
 but WITHOUT ANY WARRANTY; without even the implied warranty of
 MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 GNU Lesser General Public License for more details.

 You should have received a copy of the GNU Lesser General Public License
 along with web3.js.  If not, see <http://www.gnu.org/licenses/>.
 */
/**
 * @file SignMethodModel.js
 * @author Samuel Furter <samuel@ethereum.org>
 * @date 2018
 */

"use strict";

var AbstractMethodModel = require('../../lib/models/AbstractMethodModel');

/**
 * @param {Utils} utils
 * @param {Object} formatters
 * @param {Accounts} accounts
 *
 * @constructor
 */
function SignMethodModel(utils, formatters, accounts) {
    AbstractMethodModel.call(this, 'eth_sign', 2, utils, formatters);
    this.accounts = accounts;
}

/**
 * This method will be executed before the RPC request.
 *
 * @method beforeExecution
 *
 * @param {Array} parameters
 * @param {Object} web3Package - The package where the method is called from for example Eth.
 */
SignMethodModel.prototype.beforeExecution = function (parameters, web3Package) {
    parameters[0] = this.formatters.inputSignFormatter(parameters[0]);
    parameters[1] = this.formatters.inputAddressFormatter(parameters[1]);
};

SignMethodModel.prototype = Object.create(AbstractMethodModel.prototype);

module.exports = SignMethodModel;