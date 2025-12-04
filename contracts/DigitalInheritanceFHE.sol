// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { FHE, euint32, ebool } from "@fhevm/solidity/lib/FHE.sol";
import { SepoliaConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

contract DigitalInheritanceFHE is SepoliaConfig {

    struct EncryptedAsset {
        uint256 id;
        string assetType;        // Type of asset, e.g., social account, crypto key
        euint32 encryptedData;   // Encrypted asset data
        uint256 timestamp;
    }

    struct DecryptedAsset {
        string assetType;
        string assetValue;
        bool isRevealed;
    }

    struct InheritanceRule {
        uint256 assetId;
        ebool encryptedCondition; // e.g., death verified by oracle
        address beneficiary;
        bool executed;
    }

    uint256 public assetCount;
    uint256 public ruleCount;

    mapping(uint256 => EncryptedAsset) public encryptedAssets;
    mapping(uint256 => DecryptedAsset) public decryptedAssets;
    mapping(uint256 => InheritanceRule) public inheritanceRules;

    mapping(uint256 => uint256) private decryptionRequests;
    mapping(uint256 => uint256) private ruleRequests;

    event AssetRegistered(uint256 indexed id, uint256 timestamp);
    event AssetDecryptionRequested(uint256 indexed id);
    event AssetDecrypted(uint256 indexed id);
    event RuleAdded(uint256 indexed ruleId);
    event RuleExecuted(uint256 indexed ruleId);

    modifier onlyOwner(uint256 assetId) {
        _;
    }

    /// @notice Register a new encrypted digital asset
    function registerEncryptedAsset(
        string memory assetType,
        euint32 encryptedData
    ) public {
        assetCount += 1;
        uint256 newId = assetCount;

        encryptedAssets[newId] = EncryptedAsset({
            id: newId,
            assetType: assetType,
            encryptedData: encryptedData,
            timestamp: block.timestamp
        });

        decryptedAssets[newId] = DecryptedAsset({
            assetType: assetType,
            assetValue: "",
            isRevealed: false
        });

        emit AssetRegistered(newId, block.timestamp);
    }

    /// @notice Request decryption of an asset
    function requestAssetDecryption(uint256 assetId) public onlyOwner(assetId) {
        EncryptedAsset storage asset = encryptedAssets[assetId];
        require(!decryptedAssets[assetId].isRevealed, "Already decrypted");

        bytes32 ;
        ciphertexts[0] = FHE.toBytes32(asset.encryptedData);

        uint256 reqId = FHE.requestDecryption(ciphertexts, this.decryptAsset.selector);
        decryptionRequests[reqId] = assetId;

        emit AssetDecryptionRequested(assetId);
    }

    /// @notice Callback for decrypted asset
    function decryptAsset(
        uint256 requestId,
        bytes memory cleartexts,
        bytes memory proof
    ) public {
        uint256 assetId = decryptionRequests[requestId];
        require(assetId != 0, "Invalid request");

        EncryptedAsset storage eAsset = encryptedAssets[assetId];
        DecryptedAsset storage dAsset = decryptedAssets[assetId];
        require(!dAsset.isRevealed, "Already decrypted");

        FHE.checkSignatures(requestId, cleartexts, proof);

        string[] memory results = abi.decode(cleartexts, (string[]));
        dAsset.assetValue = results[0];
        dAsset.isRevealed = true;

        emit AssetDecrypted(assetId);
    }

    /// @notice Add a new inheritance rule
    function addInheritanceRule(
        uint256 assetId,
        ebool encryptedCondition,
        address beneficiary
    ) public {
        ruleCount += 1;
        uint256 newRuleId = ruleCount;

        inheritanceRules[newRuleId] = InheritanceRule({
            assetId: assetId,
            encryptedCondition: encryptedCondition,
            beneficiary: beneficiary,
            executed: false
        });

        emit RuleAdded(newRuleId);
    }

    /// @notice Execute inheritance rule if condition is met
    function executeRule(uint256 ruleId) public {
        InheritanceRule storage rule = inheritanceRules[ruleId];
        require(!rule.executed, "Rule already executed");

        ebool condition = rule.encryptedCondition;
        require(FHE.decryptBool(condition), "Condition not met");

        DecryptedAsset storage asset = decryptedAssets[rule.assetId];
        require(asset.isRevealed, "Asset not decrypted");

        // In practice: transfer keys or notify beneficiary
        rule.executed = true;

        emit RuleExecuted(ruleId);
    }

    /// @notice Retrieve decrypted asset info
    function getDecryptedAsset(uint256 assetId) public view returns (
        string memory assetType,
        string memory assetValue,
        bool isRevealed
    ) {
        DecryptedAsset storage asset = decryptedAssets[assetId];
        return (asset.assetType, asset.assetValue, asset.isRevealed);
    }
}
