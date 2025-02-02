var RLC                  = artifacts.require("../node_modules/rlc-faucet-contract/contracts/RLC.sol");
var IexecHub             = artifacts.require("../node_modules/iexec-poco/contracts/IexecHub.sol");
var IexecClerk           = artifacts.require("../node_modules/iexec-poco/contracts/IexecClerk.sol");
var AppRegistry          = artifacts.require("../node_modules/iexec-poco/contracts/AppRegistry.sol");
var DatasetRegistry      = artifacts.require("../node_modules/iexec-poco/contracts/DatasetRegistry.sol");
var WorkerpoolRegistry   = artifacts.require("../node_modules/iexec-poco/contracts/WorkerpoolRegistry.sol");
var App                  = artifacts.require("../node_modules/iexec-poco/contracts/App.sol");
var Dataset              = artifacts.require("../node_modules/iexec-poco/contracts/Dataset.sol");
var Workerpool           = artifacts.require("../node_modules/iexec-poco/contracts/Workerpool.sol");
var PriceOracleRequester = artifacts.require("./PriceOracleRequester.sol");

const { shouldFail } = require('openzeppelin-test-helpers');
const   multiaddr    = require('multiaddr');
const   constants    = require('../utils/constants');
const   odbtools     = require('../utils/odb-tools');
const   wallets      = require('../utils/wallets');

function extractEvents(txMined, address, name)
{
	return txMined.logs.filter((ev) => { return ev.address == address && ev.event == name });
}

contract('PriceOracleRequester', async (accounts) => {

	assert.isAtLeast(accounts.length, 10, "should have at least 10 accounts");
	let iexecAdmin      = accounts[0];
	let sgxEnclave      = accounts[0];
	let appProvider     = accounts[1];
	let datasetProvider = accounts[2];
	let scheduler       = accounts[3];
	let worker1         = accounts[4];
	let worker2         = accounts[5];
	let worker3         = accounts[6];
	let worker4         = accounts[7];
	let worker5         = accounts[8];
	let user            = accounts[9];

	var RLCInstance                = null;
	var IexecHubInstance           = null;
	var IexecClerkInstance         = null;
	var AppRegistryInstance        = null;
	var DatasetRegistryInstance    = null;
	var WorkerpoolRegistryInstance = null;

	var AppInstance        = null;
	var DatasetInstance    = null;
	var WorkerpoolInstance = null;

	var apporder        = null;
	var workerpoolorder = null;
	var requestorder    = null;

	var deal   = null;
	var task   = null;
	var worker = null;

	var date, value, id, details, result;

	var PriceOracleRequesterInstance = null;

	var totalgas = 0;

	/***************************************************************************
	 *                        Environment configuration                        *
	 ***************************************************************************/
	before("configure", async () => {
		console.log("# web3 version:", web3.version);

		/**
		 * Retreive deployed contracts
		 */
		RLCInstance                = await RLC.deployed();
		IexecHubInstance           = await IexecHub.deployed();
		IexecClerkInstance         = await IexecClerk.deployed();
		AppRegistryInstance        = await AppRegistry.deployed();
		DatasetRegistryInstance    = await DatasetRegistry.deployed();
		WorkerpoolRegistryInstance = await WorkerpoolRegistry.deployed();
		PriceOracleRequesterInstance        = await PriceOracleRequester.deployed();

		console.log("PriceOracleRequesterInstance:", PriceOracleRequesterInstance.address);

		odbtools.setup({
			name:              "iExecODB",
			version:           "3.0-alpha",
			chainId:           await web3.eth.net.getId(),
			verifyingContract: IexecClerkInstance.address,
		});

		/**
		 * Token distribution
		 */
		assert.equal(await RLCInstance.owner(), iexecAdmin, "iexecAdmin should own the RLC smart contract");
		txsMined = await Promise.all([
			RLCInstance.transfer(appProvider,     1000000000, { from: iexecAdmin, gas: constants.AMOUNT_GAS_PROVIDED }),
			RLCInstance.transfer(datasetProvider, 1000000000, { from: iexecAdmin, gas: constants.AMOUNT_GAS_PROVIDED }),
			RLCInstance.transfer(scheduler,       1000000000, { from: iexecAdmin, gas: constants.AMOUNT_GAS_PROVIDED }),
			RLCInstance.transfer(worker1,         1000000000, { from: iexecAdmin, gas: constants.AMOUNT_GAS_PROVIDED }),
			RLCInstance.transfer(worker2,         1000000000, { from: iexecAdmin, gas: constants.AMOUNT_GAS_PROVIDED }),
			RLCInstance.transfer(worker3,         1000000000, { from: iexecAdmin, gas: constants.AMOUNT_GAS_PROVIDED }),
			RLCInstance.transfer(worker4,         1000000000, { from: iexecAdmin, gas: constants.AMOUNT_GAS_PROVIDED }),
			RLCInstance.transfer(worker5,         1000000000, { from: iexecAdmin, gas: constants.AMOUNT_GAS_PROVIDED }),
			RLCInstance.transfer(user,            1000000000, { from: iexecAdmin, gas: constants.AMOUNT_GAS_PROVIDED })
		]);
		assert.isBelow(txsMined[0].receipt.gasUsed, constants.AMOUNT_GAS_PROVIDED, "should not use all gas");
		assert.isBelow(txsMined[1].receipt.gasUsed, constants.AMOUNT_GAS_PROVIDED, "should not use all gas");
		assert.isBelow(txsMined[2].receipt.gasUsed, constants.AMOUNT_GAS_PROVIDED, "should not use all gas");
		assert.isBelow(txsMined[3].receipt.gasUsed, constants.AMOUNT_GAS_PROVIDED, "should not use all gas");
		assert.isBelow(txsMined[4].receipt.gasUsed, constants.AMOUNT_GAS_PROVIDED, "should not use all gas");
		assert.isBelow(txsMined[5].receipt.gasUsed, constants.AMOUNT_GAS_PROVIDED, "should not use all gas");
		assert.isBelow(txsMined[6].receipt.gasUsed, constants.AMOUNT_GAS_PROVIDED, "should not use all gas");
		assert.isBelow(txsMined[7].receipt.gasUsed, constants.AMOUNT_GAS_PROVIDED, "should not use all gas");
		assert.isBelow(txsMined[8].receipt.gasUsed, constants.AMOUNT_GAS_PROVIDED, "should not use all gas");

		let balances = await Promise.all([
			RLCInstance.balanceOf(appProvider),
			RLCInstance.balanceOf(datasetProvider),
			RLCInstance.balanceOf(scheduler),
			RLCInstance.balanceOf(worker1),
			RLCInstance.balanceOf(worker2),
			RLCInstance.balanceOf(worker3),
			RLCInstance.balanceOf(worker4),
			RLCInstance.balanceOf(worker5),
			RLCInstance.balanceOf(user)
		]);
		assert.equal(balances[0], 1000000000, "1000000000 nRLC here");
		assert.equal(balances[1], 1000000000, "1000000000 nRLC here");
		assert.equal(balances[2], 1000000000, "1000000000 nRLC here");
		assert.equal(balances[3], 1000000000, "1000000000 nRLC here");
		assert.equal(balances[4], 1000000000, "1000000000 nRLC here");
		assert.equal(balances[5], 1000000000, "1000000000 nRLC here");
		assert.equal(balances[6], 1000000000, "1000000000 nRLC here");
		assert.equal(balances[7], 1000000000, "1000000000 nRLC here");
		assert.equal(balances[8], 1000000000, "1000000000 nRLC here");

		txsMined = await Promise.all([
			RLCInstance.approve(IexecClerkInstance.address, 1000000, { from: appProvider,     gas: constants.AMOUNT_GAS_PROVIDED }),
			RLCInstance.approve(IexecClerkInstance.address, 1000000, { from: datasetProvider, gas: constants.AMOUNT_GAS_PROVIDED }),
			RLCInstance.approve(IexecClerkInstance.address, 1000000, { from: scheduler,       gas: constants.AMOUNT_GAS_PROVIDED }),
			RLCInstance.approve(IexecClerkInstance.address, 1000000, { from: worker1,         gas: constants.AMOUNT_GAS_PROVIDED }),
			RLCInstance.approve(IexecClerkInstance.address, 1000000, { from: worker2,         gas: constants.AMOUNT_GAS_PROVIDED }),
			RLCInstance.approve(IexecClerkInstance.address, 1000000, { from: worker3,         gas: constants.AMOUNT_GAS_PROVIDED }),
			RLCInstance.approve(IexecClerkInstance.address, 1000000, { from: worker4,         gas: constants.AMOUNT_GAS_PROVIDED }),
			RLCInstance.approve(IexecClerkInstance.address, 1000000, { from: worker5,         gas: constants.AMOUNT_GAS_PROVIDED }),
			RLCInstance.approve(IexecClerkInstance.address, 1000000, { from: user,            gas: constants.AMOUNT_GAS_PROVIDED })
		]);
		assert.isBelow(txsMined[0].receipt.gasUsed, constants.AMOUNT_GAS_PROVIDED, "should not use all gas");
		assert.isBelow(txsMined[1].receipt.gasUsed, constants.AMOUNT_GAS_PROVIDED, "should not use all gas");
		assert.isBelow(txsMined[2].receipt.gasUsed, constants.AMOUNT_GAS_PROVIDED, "should not use all gas");
		assert.isBelow(txsMined[3].receipt.gasUsed, constants.AMOUNT_GAS_PROVIDED, "should not use all gas");
		assert.isBelow(txsMined[4].receipt.gasUsed, constants.AMOUNT_GAS_PROVIDED, "should not use all gas");
		assert.isBelow(txsMined[5].receipt.gasUsed, constants.AMOUNT_GAS_PROVIDED, "should not use all gas");
		assert.isBelow(txsMined[6].receipt.gasUsed, constants.AMOUNT_GAS_PROVIDED, "should not use all gas");
		assert.isBelow(txsMined[7].receipt.gasUsed, constants.AMOUNT_GAS_PROVIDED, "should not use all gas");
		assert.isBelow(txsMined[8].receipt.gasUsed, constants.AMOUNT_GAS_PROVIDED, "should not use all gas");

		txsMined = await Promise.all([
			IexecClerkInstance.deposit(100000, { from: scheduler, gas: constants.AMOUNT_GAS_PROVIDED }),
			IexecClerkInstance.deposit(100000, { from: worker1,   gas: constants.AMOUNT_GAS_PROVIDED }),
			IexecClerkInstance.deposit(100000, { from: worker2,   gas: constants.AMOUNT_GAS_PROVIDED }),
			IexecClerkInstance.deposit(100000, { from: worker3,   gas: constants.AMOUNT_GAS_PROVIDED }),
			IexecClerkInstance.deposit(100000, { from: worker4,   gas: constants.AMOUNT_GAS_PROVIDED }),
			IexecClerkInstance.deposit(100000, { from: worker5,   gas: constants.AMOUNT_GAS_PROVIDED }),
			IexecClerkInstance.deposit(100000, { from: user,      gas: constants.AMOUNT_GAS_PROVIDED }),
		]);
		assert.isBelow(txsMined[0].receipt.gasUsed, constants.AMOUNT_GAS_PROVIDED, "should not use all gas");
		assert.isBelow(txsMined[1].receipt.gasUsed, constants.AMOUNT_GAS_PROVIDED, "should not use all gas");
		assert.isBelow(txsMined[2].receipt.gasUsed, constants.AMOUNT_GAS_PROVIDED, "should not use all gas");
		assert.isBelow(txsMined[3].receipt.gasUsed, constants.AMOUNT_GAS_PROVIDED, "should not use all gas");
		assert.isBelow(txsMined[4].receipt.gasUsed, constants.AMOUNT_GAS_PROVIDED, "should not use all gas");
		assert.isBelow(txsMined[5].receipt.gasUsed, constants.AMOUNT_GAS_PROVIDED, "should not use all gas");
		assert.isBelow(txsMined[6].receipt.gasUsed, constants.AMOUNT_GAS_PROVIDED, "should not use all gas");
	});

	it("[Setup] App & Workerpool deployment", async () => {
		// CREATEAPP
		txMined = await AppRegistryInstance.createApp(
			appProvider,
			"R Clifford Attractors",
			"DOCKER",
			constants.MULTIADDR_BYTES,
			constants.NULL.BYTES32,
			"0x",
			{ from: appProvider, gas: constants.AMOUNT_GAS_PROVIDED }
		);
		assert.isBelow(txMined.receipt.gasUsed, constants.AMOUNT_GAS_PROVIDED, "should not use all gas");
		events = extractEvents(txMined, AppRegistryInstance.address, "CreateApp");
		AppInstance = await App.at(events[0].args.app);

		// CREATEWORKERPOOL
		txMined = await WorkerpoolRegistryInstance.createWorkerpool(
			scheduler,
			"A test workerpool",
			{ from: scheduler, gas: constants.AMOUNT_GAS_PROVIDED }
		);
		assert.isBelow(txMined.receipt.gasUsed, constants.AMOUNT_GAS_PROVIDED, "should not use all gas");
		events = extractEvents(txMined, WorkerpoolRegistryInstance.address, "CreateWorkerpool");
		WorkerpoolInstance = await Workerpool.at(events[0].args.workerpool);

		txMined = await WorkerpoolInstance.changePolicy(/* worker stake ratio */ 35, /* scheduler reward ratio */ 5, { from: scheduler, gas: constants.AMOUNT_GAS_PROVIDED });
		assert.isBelow(txMined.receipt.gasUsed, constants.AMOUNT_GAS_PROVIDED, "should not use all gas");
	});

	it("[Setup] Oracle setup", async () => {
		await PriceOracleRequesterInstance.updateEnv(
			AppInstance.address,
			constants.NULL.ADDRESS,
			WorkerpoolInstance.address,
			constants.NULL.BYTES32,
			0,
		);
	});

	it("[Setup] Orders & Deal", async () => {
		// Orders
		apporder = odbtools.signAppOrder(
			{
				app:                AppInstance.address,
				appprice:           0,
				volume:             1000,
				tag:                constants.NULL.BYTES32,
				datasetrestrict:    constants.NULL.ADDRESS,
				workerpoolrestrict: constants.NULL.ADDRESS,
				requesterrestrict:  constants.NULL.ADDRESS,
				salt:               web3.utils.randomHex(32),
				sign:               constants.NULL.SIGNATURE,
			},
			wallets.addressToPrivate(appProvider)
		);
		workerpoolorder = odbtools.signWorkerpoolOrder(
			{
				workerpool:        WorkerpoolInstance.address,
				workerpoolprice:   0,
				volume:            1000,
				tag:               constants.NULL.BYTES32,
				category:          0,
				trust:             100,
				apprestrict:       constants.NULL.ADDRESS,
				datasetrestrict:   constants.NULL.ADDRESS,
				requesterrestrict: constants.NULL.ADDRESS,
				salt:              web3.utils.randomHex(32),
				sign:              constants.NULL.SIGNATURE,
			},
			wallets.addressToPrivate(scheduler)
		);

		const tx        = await PriceOracleRequesterInstance.submit({ from: user, gas: constants.AMOUNT_GAS_PROVIDED });
		const [ evABI ] = IexecClerkInstance.abi.filter(o => o.name === 'BroadcastRequestOrder' && o.type == 'event');
		const [ ev    ] = tx.receipt.rawLogs.filter(l => l.topics.includes(evABI.signature));
		const decoded   = web3.eth.abi.decodeLog(evABI.inputs, ev.data, ev.topics);

		requestorder = {
			app:                decoded.requestorder.app,
			appmaxprice:        decoded.requestorder.appmaxprice,
			dataset:            decoded.requestorder.dataset,
			datasetmaxprice:    decoded.requestorder.datasetmaxprice,
			workerpool:         decoded.requestorder.workerpool,
			workerpoolmaxprice: decoded.requestorder.workerpoolmaxprice,
			volume:             decoded.requestorder.volume,
			tag:                decoded.requestorder.tag,
			category:           decoded.requestorder.category,
			trust:              decoded.requestorder.trust,
			requester:          decoded.requestorder.requester,
			beneficiary:        decoded.requestorder.beneficiary,
			callback:           decoded.requestorder.callback,
			params:             decoded.requestorder.params,
			salt:               decoded.requestorder.salt,
			sign:               decoded.requestorder.sign,
		};

		// Market
		txMined = await IexecClerkInstance.matchOrders(apporder, constants.NULL.DATAORDER, workerpoolorder, requestorder, { from: user, gasLimit: constants.AMOUNT_GAS_PROVIDED });
		assert.isBelow(txMined.receipt.gasUsed, constants.AMOUNT_GAS_PROVIDED, "should not use all gas");
		totalgas += txMined.receipt.gasUsed;

		deal = extractEvents(txMined, IexecClerkInstance.address, "OrdersMatched")[0].args.dealid;
	});

	it("[setup] Initialization", async () => {
		task = extractEvents(await IexecHubInstance.initialize(deal, 0, { from: scheduler, gas: constants.AMOUNT_GAS_PROVIDED }), IexecHubInstance.address, "TaskInitialize")[0].args.taskid;
	});

	function sendContribution(authorization, results)
	{
		return IexecHubInstance.contribute(
			authorization.taskid,                                   // task (authorization)
			results.hash,                                           // common    (result)
			results.seal,                                           // unique    (result)
			authorization.enclave,                                  // address   (enclave)
			results.sign ? results.sign : constants.NULL.SIGNATURE, // signature (enclave)
			authorization.sign,                                     // signature (authorization)
			{ from: authorization.worker, gasLimit: constants.AMOUNT_GAS_PROVIDED }
		);
	}

	it("[setup] Compute", async () => {
		const args        = (await IexecClerkInstance.viewDeal(deal)).params.split(' ');
		/*const*/ details = args.slice(0,3).join('-');
		/*const*/ date    = args[3];
		/*const*/ value   = 1889387687;
		/*const*/ id      = web3.utils.keccak256(details);
		/*const*/ result  = web3.eth.abi.encodeParameters(['uint256','string','uint256'],[date,details,value]);

		workers = [
			{
				address:     worker1,
				enclave:     constants.NULL.ADDRESS,
				callback:    result,
				determinism: web3.utils.keccak256(result)
			},
		];
	});

	it("[setup] Contribute", async () => {
		for (w of workers)
		{
			txMined = await sendContribution(
				await odbtools.signAuthorization({ worker: w.address, taskid: task, enclave: w.enclave }, scheduler),
				await (w.enclave == constants.NULL.ADDRESS ? x => x : x => odbtools.signContribution(x, w.enclave))(odbtools.sealByteResult(task, w.determinism, w.address))
			);
			totalgas += txMined.receipt.gasUsed;
		}
	});

	it("[setup] Reveal", async () => {
		for (w of workers)
		{
			txMined = await IexecHubInstance.reveal(task, odbtools.hashByteResult(task, w.determinism).digest, { from: w.address, gas: constants.AMOUNT_GAS_PROVIDED });
			totalgas += txMined.receipt.gasUsed;
		}
	});

	it("Finalize", async () => {
		txMined = await IexecHubInstance.finalize(task, result, { from: scheduler, gas: constants.AMOUNT_GAS_PROVIDED });
		assert.isBelow(txMined.receipt.gasUsed, constants.AMOUNT_GAS_PROVIDED, "should not use all gas");
		totalgas += txMined.receipt.gasUsed;
		events = extractEvents(txMined, IexecHubInstance.address, "TaskFinalize");
		assert.equal(events[0].args.taskid,  task, "check taskid");
		assert.equal(events[0].args.results, result, "check consensus (results)");
	});

	it("Process Oracle", async () => {
		const valueBefore = await PriceOracleRequesterInstance.values(id);
		assert.equal(valueBefore.date,    0 );
		assert.equal(valueBefore.details, "");
		assert.equal(valueBefore.value,   0 );

		txMined = await PriceOracleRequesterInstance.processResult(task);
		events = extractEvents(txMined, PriceOracleRequesterInstance.address, "ValueUpdated");
		assert.equal(events[0].args.id,                  id   );
		assert.equal(events[0].args.oldDate.toNumber(),  0    );
		assert.equal(events[0].args.oldValue.toNumber(), 0    );
		assert.equal(events[0].args.newDate.toNumber(),  date );
		assert.equal(events[0].args.newValue.toNumber(), value);

		totalgas += txMined.receipt.gasUsed;
		const valueAfter = await PriceOracleRequesterInstance.values(id);
		assert.equal(valueAfter.date,    date   );
		assert.equal(valueAfter.details, details);
		assert.equal(valueAfter.value,   value  );
	});

	it("Logs", async () => {
		console.log("total gas used:", totalgas)
	});

});
