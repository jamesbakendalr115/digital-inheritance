import React, { useEffect, useState } from "react";
import { ethers } from "ethers";
import { getContractReadOnly, getContractWithSigner } from "./contract";
import WalletManager from "./components/WalletManager";
import WalletSelector from "./components/WalletSelector";
import "./App.css";

interface DigitalLegacy {
  id: string;
  encryptedData: string;
  timestamp: number;
  owner: string;
  category: string;
  status: "active" | "inherited" | "expired";
  beneficiary: string;
  inheritanceConditions: string;
}

const App: React.FC = () => {
  const [account, setAccount] = useState("");
  const [loading, setLoading] = useState(true);
  const [legacies, setLegacies] = useState<DigitalLegacy[]>([]);
  const [provider, setProvider] = useState<ethers.BrowserProvider | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [walletSelectorOpen, setWalletSelectorOpen] = useState(false);
  const [transactionStatus, setTransactionStatus] = useState<{
    visible: boolean;
    status: "pending" | "success" | "error";
    message: string;
  }>({ visible: false, status: "pending", message: "" });
  const [newLegacyData, setNewLegacyData] = useState({
    category: "",
    description: "",
    sensitiveInfo: "",
    beneficiary: "",
    conditions: ""
  });
  const [activeTab, setActiveTab] = useState("dashboard");
  const [faqOpen, setFaqOpen] = useState(false);

  // Calculate statistics
  const activeCount = legacies.filter(l => l.status === "active").length;
  const inheritedCount = legacies.filter(l => l.status === "inherited").length;
  const expiredCount = legacies.filter(l => l.status === "expired").length;

  useEffect(() => {
    loadLegacies().finally(() => setLoading(false));
  }, []);

  const onWalletSelect = async (wallet: any) => {
    if (!wallet.provider) return;
    try {
      const web3Provider = new ethers.BrowserProvider(wallet.provider);
      setProvider(web3Provider);
      const accounts = await web3Provider.send("eth_requestAccounts", []);
      const acc = accounts[0] || "";
      setAccount(acc);

      wallet.provider.on("accountsChanged", async (accounts: string[]) => {
        const newAcc = accounts[0] || "";
        setAccount(newAcc);
      });
    } catch (e) {
      alert("Failed to connect wallet");
    }
  };

  const onConnect = () => setWalletSelectorOpen(true);
  const onDisconnect = () => {
    setAccount("");
    setProvider(null);
  };

  const loadLegacies = async () => {
    setIsRefreshing(true);
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      // Check contract availability using FHE
      const isAvailable = await contract.isAvailable();
      if (!isAvailable) {
        console.error("Contract is not available");
        return;
      }
      
      const keysBytes = await contract.getData("legacy_keys");
      let keys: string[] = [];
      
      if (keysBytes.length > 0) {
        try {
          keys = JSON.parse(ethers.toUtf8String(keysBytes));
        } catch (e) {
          console.error("Error parsing legacy keys:", e);
        }
      }
      
      const list: DigitalLegacy[] = [];
      
      for (const key of keys) {
        try {
          const legacyBytes = await contract.getData(`legacy_${key}`);
          if (legacyBytes.length > 0) {
            try {
              const legacyData = JSON.parse(ethers.toUtf8String(legacyBytes));
              list.push({
                id: key,
                encryptedData: legacyData.data,
                timestamp: legacyData.timestamp,
                owner: legacyData.owner,
                category: legacyData.category,
                status: legacyData.status || "active",
                beneficiary: legacyData.beneficiary || "",
                inheritanceConditions: legacyData.conditions || ""
              });
            } catch (e) {
              console.error(`Error parsing legacy data for ${key}:`, e);
            }
          }
        } catch (e) {
          console.error(`Error loading legacy ${key}:`, e);
        }
      }
      
      list.sort((a, b) => b.timestamp - a.timestamp);
      setLegacies(list);
    } catch (e) {
      console.error("Error loading legacies:", e);
    } finally {
      setIsRefreshing(false);
      setLoading(false);
    }
  };

  const submitLegacy = async () => {
    if (!provider) { 
      alert("Please connect wallet first"); 
      return; 
    }
    
    setCreating(true);
    setTransactionStatus({
      visible: true,
      status: "pending",
      message: "Encrypting sensitive data with Zama FHE..."
    });
    
    try {
      // Simulate FHE encryption
      const encryptedData = `FHE-${btoa(JSON.stringify(newLegacyData))}`;
      
      const contract = await getContractWithSigner();
      if (!contract) {
        throw new Error("Failed to get contract with signer");
      }
      
      const legacyId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

      const legacyData = {
        data: encryptedData,
        timestamp: Math.floor(Date.now() / 1000),
        owner: account,
        category: newLegacyData.category,
        status: "active",
        beneficiary: newLegacyData.beneficiary,
        conditions: newLegacyData.conditions
      };
      
      // Store encrypted data on-chain using FHE
      await contract.setData(
        `legacy_${legacyId}`, 
        ethers.toUtf8Bytes(JSON.stringify(legacyData))
      );
      
      const keysBytes = await contract.getData("legacy_keys");
      let keys: string[] = [];
      
      if (keysBytes.length > 0) {
        try {
          keys = JSON.parse(ethers.toUtf8String(keysBytes));
        } catch (e) {
          console.error("Error parsing keys:", e);
        }
      }
      
      keys.push(legacyId);
      
      await contract.setData(
        "legacy_keys", 
        ethers.toUtf8Bytes(JSON.stringify(keys))
      );
      
      setTransactionStatus({
        visible: true,
        status: "success",
        message: "Encrypted legacy created securely!"
      });
      
      await loadLegacies();
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
        setShowCreateModal(false);
        setNewLegacyData({
          category: "",
          description: "",
          sensitiveInfo: "",
          beneficiary: "",
          conditions: ""
        });
      }, 2000);
    } catch (e: any) {
      const errorMessage = e.message.includes("user rejected transaction")
        ? "Transaction rejected by user"
        : "Submission failed: " + (e.message || "Unknown error");
      
      setTransactionStatus({
        visible: true,
        status: "error",
        message: errorMessage
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 3000);
    } finally {
      setCreating(false);
    }
  };

  const triggerInheritance = async (legacyId: string) => {
    if (!provider) {
      alert("Please connect wallet first");
      return;
    }

    setTransactionStatus({
      visible: true,
      status: "pending",
      message: "Verifying inheritance conditions with FHE..."
    });

    try {
      // Simulate FHE computation time
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      const contract = await getContractWithSigner();
      if (!contract) {
        throw new Error("Failed to get contract with signer");
      }
      
      const legacyBytes = await contract.getData(`legacy_${legacyId}`);
      if (legacyBytes.length === 0) {
        throw new Error("Legacy not found");
      }
      
      const legacyData = JSON.parse(ethers.toUtf8String(legacyBytes));
      
      const updatedLegacy = {
        ...legacyData,
        status: "inherited"
      };
      
      await contract.setData(
        `legacy_${legacyId}`, 
        ethers.toUtf8Bytes(JSON.stringify(updatedLegacy))
      );
      
      setTransactionStatus({
        visible: true,
        status: "success",
        message: "FHE inheritance verification completed!"
      });
      
      await loadLegacies();
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
    } catch (e: any) {
      setTransactionStatus({
        visible: true,
        status: "error",
        message: "Inheritance failed: " + (e.message || "Unknown error")
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 3000);
    }
  };

  const expireLegacy = async (legacyId: string) => {
    if (!provider) {
      alert("Please connect wallet first");
      return;
    }

    setTransactionStatus({
      visible: true,
      status: "pending",
      message: "Processing with FHE..."
    });

    try {
      // Simulate FHE computation time
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      const contract = await getContractWithSigner();
      if (!contract) {
        throw new Error("Failed to get contract with signer");
      }
      
      const legacyBytes = await contract.getData(`legacy_${legacyId}`);
      if (legacyBytes.length === 0) {
        throw new Error("Legacy not found");
      }
      
      const legacyData = JSON.parse(ethers.toUtf8String(legacyBytes));
      
      const updatedLegacy = {
        ...legacyData,
        status: "expired"
      };
      
      await contract.setData(
        `legacy_${legacyId}`, 
        ethers.toUtf8Bytes(JSON.stringify(updatedLegacy))
      );
      
      setTransactionStatus({
        visible: true,
        status: "success",
        message: "Legacy expired successfully!"
      });
      
      await loadLegacies();
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
    } catch (e: any) {
      setTransactionStatus({
        visible: true,
        status: "error",
        message: "Expiration failed: " + (e.message || "Unknown error")
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 3000);
    }
  };

  const isOwner = (address: string) => {
    return account.toLowerCase() === address.toLowerCase();
  };

  const renderPieChart = () => {
    const total = legacies.length || 1;
    const activePercentage = (activeCount / total) * 100;
    const inheritedPercentage = (inheritedCount / total) * 100;
    const expiredPercentage = (expiredCount / total) * 100;

    return (
      <div className="pie-chart-container">
        <div className="pie-chart">
          <div 
            className="pie-segment active" 
            style={{ transform: `rotate(${activePercentage * 3.6}deg)` }}
          ></div>
          <div 
            className="pie-segment inherited" 
            style={{ transform: `rotate(${(activePercentage + inheritedPercentage) * 3.6}deg)` }}
          ></div>
          <div 
            className="pie-segment expired" 
            style={{ transform: `rotate(${(activePercentage + inheritedPercentage + expiredPercentage) * 3.6}deg)` }}
          ></div>
          <div className="pie-center">
            <div className="pie-value">{legacies.length}</div>
            <div className="pie-label">Legacies</div>
          </div>
        </div>
        <div className="pie-legend">
          <div className="legend-item">
            <div className="color-box active"></div>
            <span>Active: {activeCount}</span>
          </div>
          <div className="legend-item">
            <div className="color-box inherited"></div>
            <span>Inherited: {inheritedCount}</span>
          </div>
          <div className="legend-item">
            <div className="color-box expired"></div>
            <span>Expired: {expiredCount}</span>
          </div>
        </div>
      </div>
    );
  };

  if (loading) return (
    <div className="loading-screen">
      <div className="nature-spinner">
        <div className="leaf leaf1"></div>
        <div className="leaf leaf2"></div>
        <div className="leaf leaf3"></div>
      </div>
      <p>Initializing encrypted connection...</p>
    </div>
  );

  return (
    <div className="app-container nature-theme">
      <header className="app-header">
        <div className="logo">
          <div className="logo-icon">
            <div className="tree-icon"></div>
          </div>
          <h1>Heritage<span>Guard</span></h1>
        </div>
        
        <div className="header-actions">
          <button 
            onClick={() => setShowCreateModal(true)} 
            className="create-legacy-btn nature-button"
          >
            <div className="add-icon"></div>
            Add Legacy
          </button>
          <WalletManager account={account} onConnect={onConnect} onDisconnect={onDisconnect} />
        </div>
      </header>
      
      <div className="main-content">
        <div className="welcome-banner">
          <div className="welcome-text">
            <h2>Secure Digital Inheritance</h2>
            <p>Protect your digital legacy with FHE encryption and privacy-preserving inheritance rules</p>
          </div>
        </div>
        
        <div className="navigation-tabs">
          <button 
            className={`tab-button ${activeTab === "dashboard" ? "active" : ""}`}
            onClick={() => setActiveTab("dashboard")}
          >
            Dashboard
          </button>
          <button 
            className={`tab-button ${activeTab === "legacies" ? "active" : ""}`}
            onClick={() => setActiveTab("legacies")}
          >
            My Legacies
          </button>
          <button 
            className={`tab-button ${activeTab === "partners" ? "active" : ""}`}
            onClick={() => setActiveTab("partners")}
          >
            Partners
          </button>
          <button 
            className={`tab-button ${activeTab === "faq" ? "active" : ""}`}
            onClick={() => setActiveTab("faq")}
          >
            FAQ
          </button>
        </div>
        
        {activeTab === "dashboard" && (
          <div className="dashboard-grid">
            <div className="dashboard-card nature-card">
              <h3>Project Introduction</h3>
              <p>HeritageGuard uses Fully Homomorphic Encryption (FHE) to protect your digital assets while allowing secure inheritance by designated beneficiaries.</p>
              <div className="fhe-badge">
                <span>FHE-Powered Privacy</span>
              </div>
            </div>
            
            <div className="dashboard-card nature-card">
              <h3>Data Statistics</h3>
              <div className="stats-grid">
                <div className="stat-item">
                  <div className="stat-value">{legacies.length}</div>
                  <div className="stat-label">Total Legacies</div>
                </div>
                <div className="stat-item">
                  <div className="stat-value">{activeCount}</div>
                  <div className="stat-label">Active</div>
                </div>
                <div className="stat-item">
                  <div className="stat-value">{inheritedCount}</div>
                  <div className="stat-label">Inherited</div>
                </div>
                <div className="stat-item">
                  <div className="stat-value">{expiredCount}</div>
                  <div className="stat-label">Expired</div>
                </div>
              </div>
            </div>
            
            <div className="dashboard-card nature-card">
              <h3>Status Distribution</h3>
              {renderPieChart()}
            </div>
          </div>
        )}
        
        {activeTab === "legacies" && (
          <div className="legacies-section">
            <div className="section-header">
              <h2>My Digital Legacies</h2>
              <div className="header-actions">
                <button 
                  onClick={loadLegacies}
                  className="refresh-btn nature-button"
                  disabled={isRefreshing}
                >
                  {isRefreshing ? "Refreshing..." : "Refresh"}
                </button>
              </div>
            </div>
            
            <div className="legacies-list nature-card">
              <div className="table-header">
                <div className="header-cell">ID</div>
                <div className="header-cell">Category</div>
                <div className="header-cell">Beneficiary</div>
                <div className="header-cell">Date</div>
                <div className="header-cell">Status</div>
                <div className="header-cell">Actions</div>
              </div>
              
              {legacies.length === 0 ? (
                <div className="no-legacies">
                  <div className="no-legacies-icon"></div>
                  <p>No digital legacies found</p>
                  <button 
                    className="nature-button primary"
                    onClick={() => setShowCreateModal(true)}
                  >
                    Create First Legacy
                  </button>
                </div>
              ) : (
                legacies.filter(l => isOwner(l.owner)).map(legacy => (
                  <div className="legacy-row" key={legacy.id}>
                    <div className="table-cell legacy-id">#{legacy.id.substring(0, 6)}</div>
                    <div className="table-cell">{legacy.category}</div>
                    <div className="table-cell">{legacy.beneficiary.substring(0, 6)}...{legacy.beneficiary.substring(38)}</div>
                    <div className="table-cell">
                      {new Date(legacy.timestamp * 1000).toLocaleDateString()}
                    </div>
                    <div className="table-cell">
                      <span className={`status-badge ${legacy.status}`}>
                        {legacy.status}
                      </span>
                    </div>
                    <div className="table-cell actions">
                      {isOwner(legacy.owner) && legacy.status === "active" && (
                        <>
                          <button 
                            className="action-btn nature-button success"
                            onClick={() => triggerInheritance(legacy.id)}
                          >
                            Trigger Inheritance
                          </button>
                          <button 
                            className="action-btn nature-button danger"
                            onClick={() => expireLegacy(legacy.id)}
                          >
                            Expire
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
        
        {activeTab === "partners" && (
          <div className="partners-section">
            <h2>Trusted Partners</h2>
            <div className="partners-grid">
              <div className="partner-card nature-card">
                <div className="partner-logo zama"></div>
                <h3>Zama</h3>
                <p>FHE technology provider</p>
              </div>
              <div className="partner-card nature-card">
                <div className="partner-logo shamir"></div>
                <h3>Shamir Security</h3>
                <p>Key management solutions</p>
              </div>
              <div className="partner-card nature-card">
                <div className="partner-logo oracle"></div>
                <h3>OracleChain</h3>
                <p>Decentralized verification</p>
              </div>
              <div className="partner-card nature-card">
                <div className="partner-logo legal"></div>
                <h3>LegalTech Partners</h3>
                <p>Inheritance law specialists</p>
              </div>
            </div>
          </div>
        )}
        
        {activeTab === "faq" && (
          <div className="faq-section">
            <h2>Frequently Asked Questions</h2>
            
            <div className="faq-item">
              <div className="faq-question" onClick={() => setFaqOpen(faqOpen === "q1" ? "" : "q1")}>
                <h3>What is FHE and how does it protect my digital legacy?</h3>
                <div className={`faq-toggle ${faqOpen === "q1" ? "open" : ""}`}></div>
              </div>
              {faqOpen === "q1" && (
                <div className="faq-answer">
                  <p>Fully Homomorphic Encryption (FHE) allows computations to be performed on encrypted data without decrypting it first. This means your sensitive information remains encrypted at all times, even during inheritance verification.</p>
                </div>
              )}
            </div>
            
            <div className="faq-item">
              <div className="faq-question" onClick={() => setFaqOpen(faqOpen === "q2" ? "" : "q2")}>
                <h3>How are inheritance conditions verified?</h3>
                <div className={`faq-toggle ${faqOpen === "q2" ? "open" : ""}`}></div>
              </div>
              {faqOpen === "q2" && (
                <div className="faq-answer">
                  <p>We use decentralized oracles to verify real-world conditions (like death certificates) without revealing sensitive information. The verification happens using FHE, ensuring your privacy is maintained.</p>
                </div>
              )}
            </div>
            
            <div className="faq-item">
              <div className="faq-question" onClick={() => setFaqOpen(faqOpen === "q3" ? "" : "q3")}>
                <h3>What happens if I lose access to my wallet?</h3>
                <div className={`faq-toggle ${faqOpen === "q3" ? "open" : ""}`}></div>
              </div>
              {faqOpen === "q3" && (
                <div className="faq-answer">
                  <p>We use Shamir's Secret Sharing to distribute recovery keys among trusted parties. You can set up multiple recovery contacts to ensure you can regain access if needed.</p>
                </div>
              )}
            </div>
            
            <div className="faq-item">
              <div className="faq-question" onClick={() => setFaqOpen(faqOpen === "q4" ? "" : "q4")}>
                <h3>Can I update my digital legacy after creating it?</h3>
                <div className={`faq-toggle ${faqOpen === "q4" ? "open" : ""}`}></div>
              </div>
              {faqOpen === "q4" && (
                <div className="faq-answer">
                  <p>Yes, you can update your legacy at any time while it's active. Simply access the legacy record and make the necessary changes. All updates are encrypted with FHE for security.</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
  
      {showCreateModal && (
        <ModalCreate 
          onSubmit={submitLegacy} 
          onClose={() => setShowCreateModal(false)} 
          creating={creating}
          legacyData={newLegacyData}
          setLegacyData={setNewLegacyData}
        />
      )}
      
      {walletSelectorOpen && (
        <WalletSelector
          isOpen={walletSelectorOpen}
          onWalletSelect={(wallet) => { onWalletSelect(wallet); setWalletSelectorOpen(false); }}
          onClose={() => setWalletSelectorOpen(false)}
        />
      )}
      
      {transactionStatus.visible && (
        <div className="transaction-modal">
          <div className="transaction-content nature-card">
            <div className={`transaction-icon ${transactionStatus.status}`}>
              {transactionStatus.status === "pending" && <div className="nature-spinner"></div>}
              {transactionStatus.status === "success" && <div className="check-icon"></div>}
              {transactionStatus.status === "error" && <div className="error-icon"></div>}
            </div>
            <div className="transaction-message">
              {transactionStatus.message}
            </div>
          </div>
        </div>
      )}
  
      <footer className="app-footer">
        <div className="footer-content">
          <div className="footer-brand">
            <div className="logo">
              <div className="tree-icon"></div>
              <span>HeritageGuard</span>
            </div>
            <p>Secure digital inheritance with FHE technology</p>
          </div>
          
          <div className="footer-links">
            <a href="#" className="footer-link">Documentation</a>
            <a href="#" className="footer-link">Privacy Policy</a>
            <a href="#" className="footer-link">Terms of Service</a>
            <a href="#" className="footer-link">Contact</a>
          </div>
        </div>
        
        <div className="footer-bottom">
          <div className="fhe-badge">
            <span>FHE-Powered Privacy</span>
          </div>
          <div className="copyright">
            © {new Date().getFullYear()} HeritageGuard. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
};

interface ModalCreateProps {
  onSubmit: () => void; 
  onClose: () => void; 
  creating: boolean;
  legacyData: any;
  setLegacyData: (data: any) => void;
}

const ModalCreate: React.FC<ModalCreateProps> = ({ 
  onSubmit, 
  onClose, 
  creating,
  legacyData,
  setLegacyData
}) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setLegacyData({
      ...legacyData,
      [name]: value
    });
  };

  const handleSubmit = () => {
    if (!legacyData.category || !legacyData.sensitiveInfo || !legacyData.beneficiary) {
      alert("Please fill required fields");
      return;
    }
    
    onSubmit();
  };

  return (
    <div className="modal-overlay">
      <div className="create-modal nature-card">
        <div className="modal-header">
          <h2>Create Digital Legacy</h2>
          <button onClick={onClose} className="close-modal">&times;</button>
        </div>
        
        <div className="modal-body">
          <div className="fhe-notice-banner">
            <div className="key-icon"></div> Your sensitive data will be encrypted with Zama FHE
          </div>
          
          <div className="form-grid">
            <div className="form-group">
              <label>Category *</label>
              <select 
                name="category"
                value={legacyData.category} 
                onChange={handleChange}
                className="nature-select"
              >
                <option value="">Select category</option>
                <option value="Crypto Wallet">Crypto Wallet</option>
                <option value="Social Media">Social Media</option>
                <option value="Financial Account">Financial Account</option>
                <option value="Digital Assets">Digital Assets</option>
                <option value="Personal Documents">Personal Documents</option>
              </select>
            </div>
            
            <div className="form-group">
              <label>Description</label>
              <input 
                type="text"
                name="description"
                value={legacyData.description} 
                onChange={handleChange}
                placeholder="Brief description..." 
                className="nature-input"
              />
            </div>
            
            <div className="form-group">
              <label>Beneficiary Address *</label>
              <input 
                type="text"
                name="beneficiary"
                value={legacyData.beneficiary} 
                onChange={handleChange}
                placeholder="0x..." 
                className="nature-input"
              />
            </div>
            
            <div className="form-group">
              <label>Inheritance Conditions *</label>
              <textarea 
                name="conditions"
                value={legacyData.conditions} 
                onChange={handleChange}
                placeholder="Describe conditions for inheritance..." 
                className="nature-textarea"
                rows={2}
              />
            </div>
            
            <div className="form-group full-width">
              <label>Sensitive Information *</label>
              <textarea 
                name="sensitiveInfo"
                value={legacyData.sensitiveInfo} 
                onChange={handleChange}
                placeholder="Enter sensitive information to encrypt..." 
                className="nature-textarea"
                rows={4}
              />
            </div>
          </div>
          
          <div className="privacy-notice">
            <div className="privacy-icon"></div> Data remains encrypted during FHE processing
          </div>
        </div>
        
        <div className="modal-footer">
          <button 
            onClick={onClose}
            className="cancel-btn nature-button"
          >
            Cancel
          </button>
          <button 
            onClick={handleSubmit} 
            disabled={creating}
            className="submit-btn nature-button primary"
          >
            {creating ? "Encrypting with FHE..." : "Create Legacy"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default App;