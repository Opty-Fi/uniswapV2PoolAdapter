// solhint-disable no-unused-vars
// SPDX-License-Identifier: agpl-3.0

pragma solidity =0.8.11;

//  libraries
import { UniswapV2Library } from "../../libraries/UniswapV2Library.sol";
import { Babylonian } from "@uniswap/lib/contracts/libraries/Babylonian.sol";

// helpers
import { AdapterModifiersBase } from "../../utils/AdapterModifiersBase.sol";

//  interfaces
import { IERC20 } from "@openzeppelin/contracts-0.8.x/token/ERC20/IERC20.sol";
import { IERC20Metadata } from "@openzeppelin/contracts-0.8.x/token/ERC20/extensions/IERC20Metadata.sol";
import { IAdapter } from "@optyfi/defi-legos/interfaces/defiAdapters/contracts/IAdapter.sol";
import "@uniswap/v2-periphery/contracts/interfaces/IUniswapV2Router02.sol";
import { IUniswapV2Pair } from "@optyfi/defi-legos/ethereum/uniswapV2/contracts/IUniswapV2Pair.sol";
import { IUniswapV2Factory } from "@uniswap/v2-core/contracts/interfaces/IUniswapV2Factory.sol";
import { IOptyFiOracle } from "../../utils/optyfi-oracle/contracts/interfaces/IOptyFiOracle.sol";

/**
 * @title Adapter for Sushiswap pools protocol
 * @author Opty.fi
 * @dev Abstraction layer to Sushiswap finance's pools
 */

contract SushiswapPoolAdapterPolygon is IAdapter, AdapterModifiersBase {
    struct Tolerance {
        address liquidityPool;
        uint256 tolerance;
    }

    struct Slippage {
        address liquidityPool;
        address wantToken;
        uint256 slippage;
    }

    /** @notice Sushiswap router contract on Polygon */
    IUniswapV2Router02 public constant sushiswapRouter = IUniswapV2Router02(0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506);

    /** @notice Sushiswap factory contract on Ethereum mainnet */
    IUniswapV2Factory public constant sushiswapFactory = IUniswapV2Factory(0xc35DADB65012eC5796536bD9864eD8773aBc74C4);

    /** @notice Sushiswap WMATIC-USDC liquidity pool address */
    address public constant WMATIC_USDC = address(0xcd353F79d9FADe311fC3119B841e1f456b54e858);

    /** @notice Sushiswap USDC-USDT liquidity pool address */
    address public constant USDC_USDT = address(0x4B1F1e2435A9C96f7330FAea190Ef6A7C8D70001);

    /** @notice Sushiswap USDC-DAI liquidity pool address */
    address public constant USDC_DAI = address(0xCD578F016888B57F1b1e3f887f392F0159E26747);

    /** @notice WMATIC token address*/
    address public constant WMATIC = address(0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270);

    /** @notice USDC token address*/
    address public constant USDC = address(0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174);

    /** @notice USDT token address*/
    address public constant USDT = address(0xc2132D05D31c914a87C6611C10748AEb04B58e8F);

    /** @notice DAI token address*/
    address public constant DAI = address(0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063);

    /** @notice Denominator for basis points calculations */
    uint256 public constant DENOMINATOR = 10000;

    /** @notice OptyFi Oracle contract on Ethereum mainnet */
    IOptyFiOracle public optyFiOracle;

    /** @notice Maps liquidity pool to maximum price deviation */
    mapping(address => uint256) public liquidityPoolToTolerance;

    /** @notice Maps liquidity pool to want token to slippage */
    mapping(address => mapping(address => uint256)) public liquidityPoolToWantTokenToSlippage;

    constructor(address _registry, address _optyFiOracle) AdapterModifiersBase(_registry) {
        optyFiOracle = IOptyFiOracle(_optyFiOracle);
        liquidityPoolToTolerance[WMATIC_USDC] = uint256(100); // 1%
        liquidityPoolToTolerance[USDC_USDT] = uint256(100); // 1%
        liquidityPoolToTolerance[USDC_DAI] = uint256(100); // 1%
        liquidityPoolToWantTokenToSlippage[WMATIC_USDC][WMATIC] = uint256(100); // 1%
        liquidityPoolToWantTokenToSlippage[WMATIC_USDC][USDC] = uint256(100); // 1%
        liquidityPoolToWantTokenToSlippage[USDC_USDT][USDC] = uint256(100); // 1%
        liquidityPoolToWantTokenToSlippage[USDC_USDT][USDT] = uint256(100); // 1%
        liquidityPoolToWantTokenToSlippage[USDC_DAI][USDC] = uint256(100); // 1%
        liquidityPoolToWantTokenToSlippage[USDC_DAI][DAI] = uint256(100); // 1%
    }

    /**
     * @notice Sets the OptyFi Oracle contract
     * @param _optyFiOracle OptyFi Oracle contract address
     */
    function setOptyFiOracle(address _optyFiOracle) external onlyOperator {
        optyFiOracle = IOptyFiOracle(_optyFiOracle);
    }

    /**
     * @notice Sets the price deviation tolerance for a set of liquidity pools
     * @param _tolerances array of Tolerance structs that links liquidity pools to tolerances
     */
    function setLiquidityPoolToTolerance(Tolerance[] calldata _tolerances) external onlyRiskOperator {
        uint256 _len = _tolerances.length;
        for (uint256 i; i < _len; i++) {
            liquidityPoolToTolerance[_tolerances[i].liquidityPool] = _tolerances[i].tolerance;
        }
    }

    /**
     * @notice Sets slippage per want token of pair contract
     * @param _slippages array of Slippage structs that links liquidity pools to slippage per want token
     */
    function setLiquidityPoolToWantTokenToSlippage(Slippage[] calldata _slippages) external onlyRiskOperator {
        uint256 _len = _slippages.length;
        for (uint256 i; i < _len; i++) {
            liquidityPoolToWantTokenToSlippage[_slippages[i].liquidityPool][_slippages[i].wantToken] = _slippages[i]
                .slippage;
        }
    }

    /**
     * @inheritdoc IAdapter
     */
    function getDepositAllCodes(
        address payable _vault,
        address _underlyingToken,
        address _liquidityPool
    ) public view override returns (bytes[] memory _codes) {
        uint256 _amount = IERC20(_underlyingToken).balanceOf(_vault);
        return getDepositSomeCodes(_vault, _underlyingToken, _liquidityPool, _amount);
    }

    /**
     * @inheritdoc IAdapter
     */
    function getWithdrawAllCodes(
        address payable _vault,
        address _underlyingToken,
        address _liquidityPool
    ) public view override returns (bytes[] memory _codes) {
        uint256 _redeemAmount = getLiquidityPoolTokenBalance(_vault, _underlyingToken, _liquidityPool);
        return getWithdrawSomeCodes(_vault, _underlyingToken, _liquidityPool, _redeemAmount);
    }

    /**
     * @inheritdoc IAdapter
     */
    function getUnderlyingTokens(address _liquidityPool, address)
        public
        view
        override
        returns (address[] memory _underlyingTokens)
    {
        _underlyingTokens = new address[](2);
        _underlyingTokens[0] = IUniswapV2Pair(_liquidityPool).token0();
        _underlyingTokens[1] = IUniswapV2Pair(_liquidityPool).token1();
    }

    /**
     * @inheritdoc IAdapter
     */
    function calculateAmountInLPToken(
        address _underlyingToken,
        address _liquidityPool,
        uint256 _depositAmount
    ) public view override returns (uint256) {
        (uint256 reserve0, uint256 reserve1, ) = IUniswapV2Pair(_liquidityPool).getReserves();
        address _token0 = IUniswapV2Pair(_liquidityPool).token0();
        address _token1 = IUniswapV2Pair(_liquidityPool).token1();
        if (IUniswapV2Pair(_liquidityPool).token0() != _underlyingToken) {
            (reserve0, _token0, reserve1, _token1) = (reserve1, _token1, reserve0, _token0);
        }

        _isPoolBalanced(_token0, _token1, reserve0, reserve1, _liquidityPool);

        // assuming the function is called by vault as msg.sender
        uint256 remainingAmount1 = IERC20(_token1).balanceOf(msg.sender);
        uint256 swapInAmount = _calculateSwapInAmount(reserve0, reserve1, _depositAmount, remainingAmount1);
        uint256 swapOutAmount = _calculateSwapOutAmount(swapInAmount, _token0, _token1) + remainingAmount1;
        reserve0 = reserve0 + swapInAmount;
        reserve1 = reserve1 - swapOutAmount;
        uint256 _totalSupply = _getPoolTotalSupply(_liquidityPool, reserve0, reserve1);
        uint256 amount0Optimal = _depositAmount - swapInAmount;
        uint256 amount1Optimal = UniswapV2Library.quote(amount0Optimal, reserve0, reserve1);
        if (amount1Optimal > swapOutAmount) {
            amount1Optimal = swapOutAmount;
            amount0Optimal = UniswapV2Library.quote(amount1Optimal, reserve1, reserve0);
        }
        uint256 liquidity = (amount0Optimal * _totalSupply) / reserve0;
        if (liquidity > (amount1Optimal * _totalSupply) / reserve1) {
            liquidity = (amount1Optimal * _totalSupply) / reserve1;
        }
        return liquidity;
    }

    /**
     * @inheritdoc IAdapter
     */
    function calculateRedeemableLPTokenAmount(
        address payable _vault,
        address _underlyingToken,
        address _liquidityPool,
        uint256 _redeemAmount
    ) public view override returns (uint256) {
        uint256 _liquidityPoolTokenBalance = getLiquidityPoolTokenBalance(_vault, _underlyingToken, _liquidityPool);
        uint256 _balanceInToken = getAllAmountInToken(_vault, _underlyingToken, _liquidityPool);
        return (_liquidityPoolTokenBalance * _redeemAmount) / _balanceInToken + 1;
    }

    /**
     * @inheritdoc IAdapter
     */
    function isRedeemableAmountSufficient(
        address payable _vault,
        address _underlyingToken,
        address _liquidityPool,
        uint256 _redeemAmount
    ) public view override returns (bool) {
        uint256 _balanceInToken = getAllAmountInToken(_vault, _underlyingToken, _liquidityPool);
        return _balanceInToken >= _redeemAmount;
    }

    /**
     * @inheritdoc IAdapter
     */
    function canStake(address) public pure override returns (bool) {
        return false;
    }

    /**
     * @inheritdoc IAdapter
     */
    function getDepositSomeCodes(
        address payable _vault,
        address _underlyingToken,
        address _liquidityPool,
        uint256 _amount
    ) public view override returns (bytes[] memory _codes) {
        if (_amount > 0) {
            _codes = new bytes[](6);
            _codes[0] = abi.encode(
                _underlyingToken,
                abi.encodeWithSignature("approve(address,uint256)", sushiswapRouter, uint256(0))
            );
            address toToken;
            uint256 swapInAmount;
            uint256 swapOutAmount;
            uint256 _remainingToTokenAmount;
            // avoid stack too deep
            {
                (uint256 reserve0, uint256 reserve1, ) = IUniswapV2Pair(_liquidityPool).getReserves();
                toToken = IUniswapV2Pair(_liquidityPool).token1();
                if (toToken == _underlyingToken) {
                    (reserve0, reserve1) = (reserve1, reserve0);
                    toToken = IUniswapV2Pair(_liquidityPool).token0();
                }
                _isPoolBalanced(_underlyingToken, toToken, reserve0, reserve1, _liquidityPool);
                _remainingToTokenAmount = IERC20(toToken).balanceOf(_vault);
                swapInAmount = _calculateSwapInAmount(reserve0, reserve1, _amount, _remainingToTokenAmount);
                swapOutAmount = _calculateSwapOutAmount(swapInAmount, _underlyingToken, toToken);

                _codes[1] = abi.encode(
                    _underlyingToken,
                    abi.encodeWithSignature("approve(address,uint256)", sushiswapRouter, _amount)
                );
                address[] memory path = new address[](2);
                path[0] = _underlyingToken;
                path[1] = toToken;

                _codes[2] = abi.encode(
                    sushiswapRouter,
                    abi.encodeWithSignature(
                        "swapExactTokensForTokens(uint256,uint256,address[],address,uint256)",
                        swapInAmount,
                        (swapOutAmount * (DENOMINATOR - liquidityPoolToWantTokenToSlippage[_liquidityPool][toToken])) /
                            DENOMINATOR,
                        path,
                        _vault,
                        type(uint256).max
                    )
                );
            }
            _codes[3] = abi.encode(
                toToken,
                abi.encodeWithSignature("approve(address,uint256)", sushiswapRouter, uint256(0))
            );
            _codes[4] = abi.encode(
                toToken,
                abi.encodeWithSignature(
                    "approve(address,uint256)",
                    sushiswapRouter,
                    swapOutAmount + _remainingToTokenAmount
                )
            );
            _codes[5] = abi.encode(
                sushiswapRouter,
                abi.encodeWithSignature(
                    "addLiquidity(address,address,uint256,uint256,uint256,uint256,address,uint256)",
                    _underlyingToken,
                    toToken,
                    _amount - swapInAmount,
                    ((swapOutAmount * (DENOMINATOR - liquidityPoolToWantTokenToSlippage[_liquidityPool][toToken])) /
                        DENOMINATOR) + _remainingToTokenAmount,
                    0,
                    0,
                    _vault,
                    type(uint256).max
                )
            );
        }
    }

    /**
     * @inheritdoc IAdapter
     */
    function getWithdrawSomeCodes(
        address payable _vault,
        address _underlyingToken,
        address _liquidityPool,
        uint256 _shares
    ) public view override returns (bytes[] memory _codes) {
        if (_shares > 0) {
            _codes = new bytes[](6);
            _codes[0] = abi.encode(
                _liquidityPool,
                abi.encodeWithSignature("approve(address,uint256)", sushiswapRouter, 0)
            );
            _codes[1] = abi.encode(
                _liquidityPool,
                abi.encodeWithSignature("approve(address,uint256)", sushiswapRouter, _shares)
            );
            uint256 outAmountUT;
            uint256 outAmountToToken;
            address toToken = IUniswapV2Pair(_liquidityPool).token1();
            (uint256 reserve0, uint256 reserve1, ) = IUniswapV2Pair(_liquidityPool).getReserves();

            {
                uint256 _totalSupply = _getPoolTotalSupply(_liquidityPool, reserve0, reserve1);
                outAmountUT = (reserve0 * _shares) / _totalSupply;
                outAmountToToken = (reserve1 * _shares) / _totalSupply;
                if (toToken == _underlyingToken) {
                    (reserve0, reserve1, outAmountUT, outAmountToToken) = (
                        reserve1,
                        reserve0,
                        outAmountToToken,
                        outAmountUT
                    );
                    toToken = IUniswapV2Pair(_liquidityPool).token0();
                }

                _isPoolBalanced(_underlyingToken, toToken, reserve0, reserve1, _liquidityPool);
            }
            _codes[2] = abi.encode(
                sushiswapRouter,
                abi.encodeWithSignature(
                    "removeLiquidity(address,address,uint256,uint256,uint256,address,uint256)",
                    _underlyingToken,
                    toToken,
                    _shares,
                    outAmountUT,
                    outAmountToToken,
                    _vault,
                    type(uint256).max
                )
            );
            _codes[3] = abi.encode(toToken, abi.encodeWithSignature("approve(address,uint256)", sushiswapRouter, 0));
            _codes[4] = abi.encode(
                toToken,
                abi.encodeWithSignature(
                    "approve(address,uint256)",
                    sushiswapRouter,
                    outAmountToToken + IERC20(toToken).balanceOf(_vault)
                )
            );
            address[] memory path = new address[](2);
            path[0] = toToken;
            path[1] = _underlyingToken;
            uint256 _swapOutAmount = _calculateSwapOutAmount(
                ((outAmountToToken + IERC20(toToken).balanceOf(_vault)) * 997) / 1000,
                toToken,
                _underlyingToken
            );
            _codes[5] = abi.encode(
                sushiswapRouter,
                abi.encodeWithSignature(
                    "swapExactTokensForTokens(uint256,uint256,address[],address,uint256)",
                    outAmountToToken + IERC20(toToken).balanceOf(_vault),
                    (_swapOutAmount *
                        (DENOMINATOR - liquidityPoolToWantTokenToSlippage[_liquidityPool][_underlyingToken])) /
                        DENOMINATOR,
                    path,
                    _vault,
                    type(uint256).max
                )
            );
        }
    }

    /**
     * @inheritdoc IAdapter
     */
    function getPoolValue(address _liquidityPool, address _underlyingToken) public view override returns (uint256) {
        return IERC20(_underlyingToken).balanceOf(_liquidityPool) * 2;
    }

    /**
     * @inheritdoc IAdapter
     */
    function getLiquidityPoolToken(address, address _liquidityPool) public pure override returns (address) {
        return _liquidityPool;
    }

    /**
     * @inheritdoc IAdapter
     */
    function getAllAmountInToken(
        address payable _vault,
        address _underlyingToken,
        address _liquidityPool
    ) public view override returns (uint256) {
        address toToken = IUniswapV2Pair(_liquidityPool).token1();
        if (toToken == _underlyingToken) {
            toToken = IUniswapV2Pair(_liquidityPool).token0();
        }
        return
            getSomeAmountInToken(
                _underlyingToken,
                _liquidityPool,
                getLiquidityPoolTokenBalance(_vault, _underlyingToken, _liquidityPool)
            ) + _calculateSwapOutAmount(IERC20(toToken).balanceOf(_vault), toToken, _underlyingToken);
    }

    /**
     * @inheritdoc IAdapter
     */
    function getLiquidityPoolTokenBalance(
        address payable _vault,
        address,
        address _liquidityPool
    ) public view override returns (uint256) {
        return IERC20(_liquidityPool).balanceOf(_vault);
    }

    /**
     * @inheritdoc IAdapter
     */
    function getSomeAmountInToken(
        address _underlyingToken,
        address _liquidityPool,
        uint256 _liquidityPoolTokenAmount
    ) public view override returns (uint256) {
        (uint256 reserve0, uint256 reserve1, ) = IUniswapV2Pair(_liquidityPool).getReserves();
        uint256 _totalSupply = _getPoolTotalSupply(_liquidityPool, reserve0, reserve1);
        address toToken = IUniswapV2Pair(_liquidityPool).token1();
        {
            if (toToken == _underlyingToken) {
                (reserve0, reserve1) = (reserve1, reserve0);
                toToken = IUniswapV2Pair(_liquidityPool).token0();
            }
            _isPoolBalanced(_underlyingToken, toToken, reserve0, reserve1, _liquidityPool);
        }
        uint256 underlyingTokenAmount = (reserve0 * _liquidityPoolTokenAmount) / _totalSupply;
        uint256 swapTokenAmount = (reserve1 * _liquidityPoolTokenAmount) / _totalSupply;
        uint256 swapOutAmount = _calculateSwapOutAmount(swapTokenAmount, toToken, _underlyingToken);
        return underlyingTokenAmount + swapOutAmount;
    }

    /**
     * @inheritdoc IAdapter
     */
    function getRewardToken(address) public pure override returns (address) {
        return address(0);
    }

    /**
     * @dev Get the swap amount to deposit either token in Sushiswap liquidity pool
     * @param reserveIn Reserve amount of the deposit token
     * @param reserveOut Reserve amount of the other token in the pair
     * @param userIn Input amount of the deposit token
     * @param remainingAmountOut Amount of the wanted token that remains in the vault
     * @return Amount to swap of the deposit token
     */
    function _calculateSwapInAmount(
        uint256 reserveIn,
        uint256 reserveOut,
        uint256 userIn,
        uint256 remainingAmountOut
    ) internal pure returns (uint256) {
        return
            (((Babylonian.sqrt(reserveIn * (remainingAmountOut + reserveOut))) *
                (
                    Babylonian.sqrt(
                        userIn *
                            reserveOut *
                            3988000 +
                            reserveIn *
                            reserveOut *
                            3988009 +
                            reserveIn *
                            remainingAmountOut *
                            9
                    )
                )) - (reserveIn * 1997 * (remainingAmountOut + reserveOut))) /
            (1994 * (remainingAmountOut + reserveOut));
    }

    /**
     * @dev Get the expected amount to receive of _token1 after swapping _token0
     * @param _swapInAmount Amount of _token0 to be swapped for _token1
     * @param _token0 Contract address of one of the liquidity pool's underlying tokens
     * @param _token1 Contract address of one of the liquidity pool's underlying tokens
     */
    function _calculateSwapOutAmount(
        uint256 _swapInAmount,
        address _token0,
        address _token1
    ) internal view returns (uint256 _swapOutAmount) {
        uint256 price = optyFiOracle.getTokenPrice(_token0, _token1);
        require(price > uint256(0), "!price");
        uint256 decimals0 = uint256(IERC20Metadata(_token0).decimals());
        uint256 decimals1 = uint256(IERC20Metadata(_token1).decimals());
        _swapOutAmount = (_swapInAmount * price * 10**decimals1) / 10**(18 + decimals0);
    }

    /**
     * @dev Check whether the pool is balanced or not according to OptyFi Oracle's prices
     * @param _token0 Contract address of one of the liquidity pool's underlying tokens
     * @param _token1 Contract address of one of the liquidity pool's underlying tokens
     * @param _reserve0 Liquidity pool's reserve for _token0
     * @param _reserve1 Liquidity pool's reserve for _token1
     * @param _liquidityPool Liquidity pool's contract address
     */
    function _isPoolBalanced(
        address _token0,
        address _token1,
        uint256 _reserve0,
        uint256 _reserve1,
        address _liquidityPool
    ) internal view {
        uint256 price = optyFiOracle.getTokenPrice(_token0, _token1);
        require(price > uint256(0), "!price");
        uint256 decimals0 = uint256(IERC20Metadata(_token0).decimals());
        uint256 decimals1 = uint256(IERC20Metadata(_token1).decimals());
        uint256 uniswapPrice = (_reserve1 * 10**(36 - decimals1)) / (_reserve0 * 10**(18 - decimals0));
        uint256 upperLimit = (price * (DENOMINATOR + liquidityPoolToTolerance[_liquidityPool])) / DENOMINATOR;
        uint256 lowerLimit = (price * (DENOMINATOR - liquidityPoolToTolerance[_liquidityPool])) / DENOMINATOR;
        require((uniswapPrice < upperLimit) && (uniswapPrice > lowerLimit), "!imbalanced pool");
    }

    /**
     * @dev Get the totalSupply of liquidity Pool
     * @param _liquidityPool Liquidity pool's contract address
     * @param _reserve0 reserve value of token0
     * @param _reserve1 reserve value of token1
     * @return _totalSupply calculated totalSupply amount
     */
    function _getPoolTotalSupply(
        address _liquidityPool,
        uint256 _reserve0,
        uint256 _reserve1
    ) internal view returns (uint256 _totalSupply) {
        _totalSupply = IUniswapV2Pair(_liquidityPool).totalSupply();
        if (sushiswapFactory.feeTo() != address(0)) {
            uint256 _kLast = IUniswapV2Pair(_liquidityPool).kLast();
            if (_kLast != 0) {
                uint256 rootK = Babylonian.sqrt(_reserve0 * _reserve1);
                uint256 rootKLast = Babylonian.sqrt(_kLast);
                if (rootK > rootKLast) {
                    uint256 numerator = _totalSupply * (rootK - rootKLast);
                    uint256 denominator = rootK * 5 + rootKLast;
                    uint256 liquidity = numerator / denominator;
                    if (liquidity > 0) _totalSupply += liquidity;
                }
            }
        }
    }
}
