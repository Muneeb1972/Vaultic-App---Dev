/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/vaultic.json`.
 */
export type Vaultic = {
  "address": "5igWLTbdAjGfAZKsK9G3Buhe7mkrgC3GEYkQaD4PrTnZ",
  "metadata": {
    "name": "vaultic",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "Vaultic Treasury OS — privacy-first encrypted bridgeless treasury program"
  },
  "instructions": [
    {
      "name": "approvePayrollMessage",
      "discriminator": [
        68,
        131,
        122,
        218,
        132,
        89,
        180,
        55
      ],
      "accounts": [
        {
          "name": "treasury",
          "writable": true,
          "relations": [
            "payrollExecution"
          ]
        },
        {
          "name": "authority",
          "signer": true,
          "relations": [
            "treasury"
          ]
        },
        {
          "name": "payrollExecution",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  97,
                  121,
                  114,
                  111,
                  108,
                  108,
                  95,
                  101,
                  120,
                  101,
                  99
                ]
              },
              {
                "kind": "account",
                "path": "treasury"
              },
              {
                "kind": "arg",
                "path": "executionId"
              }
            ]
          }
        },
        {
          "name": "ikaProgram"
        },
        {
          "name": "coordinator",
          "writable": true
        },
        {
          "name": "messageApproval",
          "writable": true
        },
        {
          "name": "dwallet"
        },
        {
          "name": "callerProgram",
          "docs": [
            "and Ika — see `caller_program_enc` below, which reuses this)."
          ]
        },
        {
          "name": "ikaCpiAuthority",
          "docs": [
            "program treats this as the signer of the approval."
          ],
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  95,
                  95,
                  105,
                  107,
                  97,
                  95,
                  99,
                  112,
                  105,
                  95,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
                ]
              }
            ]
          }
        },
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "encryptProgram"
        },
        {
          "name": "config"
        },
        {
          "name": "deposit",
          "writable": true
        },
        {
          "name": "encryptCpiAuthority",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  95,
                  95,
                  101,
                  110,
                  99,
                  114,
                  121,
                  112,
                  116,
                  95,
                  99,
                  112,
                  105,
                  95,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
                ]
              }
            ]
          }
        },
        {
          "name": "networkEncryptionKey"
        },
        {
          "name": "eventAuthority"
        },
        {
          "name": "ctTotalOut",
          "docs": [
            "total produced by a prior `compute_total_payout` run."
          ],
          "writable": true
        },
        {
          "name": "ctSpendingLimit",
          "docs": [
            "a `PUint64` operand for the `check_policy_compliance` graph."
          ]
        },
        {
          "name": "ctPolicyOk",
          "docs": [
            "output of `check_policy_compliance`."
          ],
          "writable": true
        },
        {
          "name": "decryptionRequest",
          "docs": [
            "keypair signer the Encrypt CPI initialises; in Phase 2 it is the",
            "already-initialised account whose data we `read_decrypted_verified`."
          ],
          "writable": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "executionId",
          "type": "u64"
        },
        {
          "name": "cpiAuthorityBump",
          "type": "u8"
        },
        {
          "name": "ikaCpiBump",
          "type": "u8"
        },
        {
          "name": "message",
          "type": "bytes"
        },
        {
          "name": "targetChain",
          "type": "u8"
        }
      ]
    },
    {
      "name": "approveTransaction",
      "discriminator": [
        224,
        39,
        88,
        181,
        36,
        59,
        155,
        122
      ],
      "accounts": [
        {
          "name": "proposal",
          "writable": true
        },
        {
          "name": "treasury",
          "relations": [
            "proposal"
          ]
        },
        {
          "name": "policy",
          "relations": [
            "proposal"
          ]
        },
        {
          "name": "approver",
          "writable": true,
          "signer": true
        }
      ],
      "args": []
    },
    {
      "name": "computeBonus",
      "discriminator": [
        100,
        255,
        112,
        202,
        23,
        98,
        127,
        200
      ],
      "accounts": [
        {
          "name": "treasury",
          "relations": [
            "employeeRecord"
          ]
        },
        {
          "name": "authority",
          "signer": true,
          "relations": [
            "treasury"
          ]
        },
        {
          "name": "employeeRecord",
          "writable": true
        },
        {
          "name": "encryptProgram"
        },
        {
          "name": "config"
        },
        {
          "name": "deposit",
          "writable": true
        },
        {
          "name": "cpiAuthority",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  95,
                  95,
                  101,
                  110,
                  99,
                  114,
                  121,
                  112,
                  116,
                  95,
                  99,
                  112,
                  105,
                  95,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
                ]
              }
            ]
          }
        },
        {
          "name": "callerProgram"
        },
        {
          "name": "networkEncryptionKey"
        },
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "eventAuthority"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        },
        {
          "name": "ctBaseSalary",
          "writable": true
        },
        {
          "name": "ctPerf",
          "writable": true
        },
        {
          "name": "ctThreshold",
          "writable": true
        },
        {
          "name": "ctOutputBonus",
          "writable": true
        }
      ],
      "args": [
        {
          "name": "cpiAuthorityBump",
          "type": "u8"
        },
        {
          "name": "bonusMultiplierBps",
          "type": "u64"
        }
      ]
    },
    {
      "name": "createDwallet",
      "discriminator": [
        240,
        75,
        19,
        67,
        93,
        219,
        217,
        131
      ],
      "accounts": [
        {
          "name": "authority",
          "writable": true,
          "signer": true,
          "relations": [
            "treasury"
          ]
        },
        {
          "name": "treasury",
          "writable": true
        },
        {
          "name": "dwallet",
          "docs": [
            "data to verify the `authority` field matches this program's",
            "`IKA_CPI_AUTHORITY_SEED` PDA. The handler explicitly checks",
            "`dwallet.owner == ika::IKA_PROGRAM_ID` so a malicious caller can't",
            "pass an arbitrary 32-byte blob."
          ]
        }
      ],
      "args": [
        {
          "name": "dwalletId",
          "type": "pubkey"
        },
        {
          "name": "curveType",
          "type": "u8"
        }
      ]
    },
    {
      "name": "createPolicy",
      "discriminator": [
        27,
        81,
        33,
        27,
        196,
        103,
        246,
        53
      ],
      "accounts": [
        {
          "name": "authority",
          "writable": true,
          "signer": true,
          "relations": [
            "treasury"
          ]
        },
        {
          "name": "treasury"
        },
        {
          "name": "policy",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  108,
                  105,
                  99,
                  121
                ]
              },
              {
                "kind": "account",
                "path": "treasury"
              },
              {
                "kind": "arg",
                "path": "policyId"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "policyId",
          "type": "u64"
        },
        {
          "name": "spendingLimit",
          "type": "u64"
        },
        {
          "name": "timeLock",
          "type": "i64"
        },
        {
          "name": "requiredApprovers",
          "type": "u8"
        },
        {
          "name": "approvers",
          "type": {
            "array": [
              "pubkey",
              5
            ]
          }
        }
      ]
    },
    {
      "name": "executePayrollComputation",
      "discriminator": [
        208,
        67,
        215,
        35,
        250,
        217,
        119,
        187
      ],
      "accounts": [
        {
          "name": "treasury",
          "writable": true,
          "relations": [
            "payrollConfig",
            "employee"
          ]
        },
        {
          "name": "authority",
          "signer": true,
          "relations": [
            "treasury"
          ]
        },
        {
          "name": "payrollConfig",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  97,
                  121,
                  114,
                  111,
                  108,
                  108,
                  95,
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              },
              {
                "kind": "account",
                "path": "treasury"
              }
            ]
          }
        },
        {
          "name": "employee"
        },
        {
          "name": "payrollExecution",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  97,
                  121,
                  114,
                  111,
                  108,
                  108,
                  95,
                  101,
                  120,
                  101,
                  99
                ]
              },
              {
                "kind": "account",
                "path": "treasury"
              },
              {
                "kind": "arg",
                "path": "executionId"
              }
            ]
          }
        },
        {
          "name": "encryptProgram"
        },
        {
          "name": "config"
        },
        {
          "name": "deposit",
          "writable": true
        },
        {
          "name": "cpiAuthority",
          "docs": [
            "Encrypt program treats this as the caller's authority signer."
          ],
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  95,
                  95,
                  101,
                  110,
                  99,
                  114,
                  121,
                  112,
                  116,
                  95,
                  99,
                  112,
                  105,
                  95,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
                ]
              }
            ]
          }
        },
        {
          "name": "callerProgram"
        },
        {
          "name": "networkEncryptionKey"
        },
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "eventAuthority"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        },
        {
          "name": "ctSalary",
          "writable": true
        },
        {
          "name": "ctBonus",
          "writable": true
        },
        {
          "name": "ctPerformance",
          "docs": [
            "Accepted but not consumed by `compute_total_payout` in the current",
            "graph shape (design §3.1.3 specifies `salary + bonus + vested`);",
            "kept in the accounts struct per the spec so the off-chain caller",
            "can still plumb the full payroll input set."
          ],
          "writable": true
        },
        {
          "name": "ctBandMin",
          "docs": [
            "See note on `ct_performance` re: current graph consumption."
          ],
          "writable": true
        },
        {
          "name": "ctBandMax",
          "writable": true
        },
        {
          "name": "ctTotalOut",
          "writable": true
        }
      ],
      "args": [
        {
          "name": "executionId",
          "type": "u64"
        },
        {
          "name": "cpiAuthorityBump",
          "type": "u8"
        }
      ]
    },
    {
      "name": "finalizePayroll",
      "discriminator": [
        48,
        94,
        59,
        135,
        246,
        121,
        126,
        138
      ],
      "accounts": [
        {
          "name": "treasury",
          "relations": [
            "payrollExecution"
          ]
        },
        {
          "name": "authority",
          "signer": true,
          "relations": [
            "treasury"
          ]
        },
        {
          "name": "payrollExecution",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  97,
                  121,
                  114,
                  111,
                  108,
                  108,
                  95,
                  101,
                  120,
                  101,
                  99
                ]
              },
              {
                "kind": "account",
                "path": "treasury"
              },
              {
                "kind": "arg",
                "path": "executionId"
              }
            ]
          }
        },
        {
          "name": "ctTotalOut"
        }
      ],
      "args": [
        {
          "name": "executionId",
          "type": "u64"
        }
      ]
    },
    {
      "name": "fundTreasury",
      "discriminator": [
        71,
        154,
        45,
        220,
        206,
        32,
        174,
        239
      ],
      "accounts": [
        {
          "name": "funder",
          "docs": [
            "Depositor — any wallet may fund a DAO treasury (design §3.1.1.3)."
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "treasury",
          "writable": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "initializeTreasury",
      "discriminator": [
        124,
        186,
        211,
        195,
        85,
        165,
        129,
        166
      ],
      "accounts": [
        {
          "name": "authority",
          "writable": true,
          "signer": true
        },
        {
          "name": "treasury",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  114,
                  101,
                  97,
                  115,
                  117,
                  114,
                  121
                ]
              },
              {
                "kind": "account",
                "path": "authority"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "name",
          "type": "string"
        },
        {
          "name": "payrollInterval",
          "type": "i64"
        },
        {
          "name": "spendingLimitPerTx",
          "type": "u64"
        },
        {
          "name": "requiredApprovers",
          "type": "u8"
        },
        {
          "name": "dwalletId",
          "type": "pubkey"
        }
      ]
    },
    {
      "name": "processClaim",
      "discriminator": [
        220,
        115,
        149,
        228,
        217,
        142,
        240,
        115
      ],
      "accounts": [
        {
          "name": "authority",
          "writable": true,
          "signer": true,
          "relations": [
            "treasury"
          ]
        },
        {
          "name": "treasury",
          "writable": true,
          "relations": [
            "employeeRecord",
            "claimRecord"
          ]
        },
        {
          "name": "employeeRecord",
          "writable": true
        },
        {
          "name": "claimRecord",
          "writable": true
        },
        {
          "name": "ikaProgram"
        },
        {
          "name": "coordinator",
          "writable": true
        },
        {
          "name": "messageApproval",
          "writable": true
        },
        {
          "name": "dwallet"
        },
        {
          "name": "callerProgram"
        },
        {
          "name": "ikaCpiAuthority",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  95,
                  95,
                  105,
                  107,
                  97,
                  95,
                  99,
                  112,
                  105,
                  95,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
                ]
              }
            ]
          }
        },
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "cpiAuthorityBump",
          "type": "u8"
        },
        {
          "name": "message",
          "type": "bytes"
        }
      ]
    },
    {
      "name": "proposeTransaction",
      "discriminator": [
        35,
        204,
        169,
        240,
        74,
        70,
        31,
        236
      ],
      "accounts": [
        {
          "name": "policy"
        },
        {
          "name": "treasury",
          "relations": [
            "policy"
          ]
        },
        {
          "name": "proposer",
          "writable": true,
          "signer": true
        },
        {
          "name": "proposal",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  112,
                  111,
                  115,
                  97,
                  108
                ]
              },
              {
                "kind": "account",
                "path": "treasury"
              },
              {
                "kind": "arg",
                "path": "nonce"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "nonce",
          "type": "u64"
        },
        {
          "name": "amount",
          "type": "u64"
        },
        {
          "name": "target",
          "type": "pubkey"
        }
      ]
    },
    {
      "name": "registerEmployee",
      "discriminator": [
        234,
        170,
        133,
        49,
        154,
        125,
        86,
        161
      ],
      "accounts": [
        {
          "name": "authority",
          "writable": true,
          "signer": true,
          "relations": [
            "treasury"
          ]
        },
        {
          "name": "treasury",
          "docs": [
            "Parent treasury — `has_one = authority` enforces Req 1.4 Unauthorized."
          ],
          "writable": true
        },
        {
          "name": "employeeRecord",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  109,
                  112,
                  108,
                  111,
                  121,
                  101,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "treasury"
              },
              {
                "kind": "arg",
                "path": "employeeWallet"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "employeeWallet",
          "type": "pubkey"
        },
        {
          "name": "roleId",
          "type": "u8"
        },
        {
          "name": "encryptedSalary",
          "type": "pubkey"
        },
        {
          "name": "encryptedBonus",
          "type": "pubkey"
        },
        {
          "name": "encryptedPerformance",
          "type": "pubkey"
        },
        {
          "name": "vestingStart",
          "type": "i64"
        },
        {
          "name": "vestingCliff",
          "type": "i64"
        },
        {
          "name": "vestingDuration",
          "type": "i64"
        },
        {
          "name": "totalAllocation",
          "type": "u64"
        },
        {
          "name": "chainPreference",
          "type": "u8"
        },
        {
          "name": "targetAddress",
          "type": {
            "array": [
              "u8",
              64
            ]
          }
        }
      ]
    },
    {
      "name": "requestSalaryDecryption",
      "discriminator": [
        152,
        234,
        153,
        216,
        145,
        233,
        80,
        119
      ],
      "accounts": [
        {
          "name": "employeeRecord",
          "writable": true
        },
        {
          "name": "treasury",
          "relations": [
            "employeeRecord"
          ]
        },
        {
          "name": "employeeWallet",
          "docs": [
            "The employee initiating the decryption request (Req 5.1). Signer",
            "check plus the `has_one = employee_wallet` on `employee_record`",
            "together satisfy Req 5.8 for this instruction."
          ],
          "signer": true,
          "relations": [
            "employeeRecord"
          ]
        },
        {
          "name": "authority",
          "docs": [
            "Pays rent for the Encrypt-owned `DecryptionRequest` account and for",
            "any Encrypt-side bookkeeping. Kept separate from `employee_wallet`",
            "so the treasury authority (or a relayer) can cover costs without",
            "requiring the employee to hold SOL."
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "decryptionRequest",
          "docs": [
            "account as a `DecryptionRequest` on the first call; subsequent",
            "reveals read its data via `read_decrypted_verified`."
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "ctSalary",
          "docs": [
            "`address = Pubkey::new_from_array(..)` constraint pins this to the",
            "employee's registered `encrypted_salary` ciphertext so no other",
            "ciphertext can be substituted."
          ],
          "writable": true
        },
        {
          "name": "encryptProgram"
        },
        {
          "name": "config"
        },
        {
          "name": "deposit",
          "writable": true
        },
        {
          "name": "encryptCpiAuthority",
          "docs": [
            "Encrypt program treats this as our caller authority signer."
          ],
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  95,
                  95,
                  101,
                  110,
                  99,
                  114,
                  121,
                  112,
                  116,
                  95,
                  99,
                  112,
                  105,
                  95,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
                ]
              }
            ]
          }
        },
        {
          "name": "callerProgram"
        },
        {
          "name": "networkEncryptionKey"
        },
        {
          "name": "eventAuthority"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "cpiAuthorityBump",
          "type": "u8"
        }
      ]
    },
    {
      "name": "revealSalary",
      "discriminator": [
        8,
        71,
        253,
        107,
        185,
        162,
        221,
        93
      ],
      "accounts": [
        {
          "name": "employeeRecord",
          "writable": true
        },
        {
          "name": "treasury",
          "relations": [
            "employeeRecord"
          ]
        },
        {
          "name": "employeeWallet",
          "docs": [
            "Req 5.8 — the employee's wallet MUST sign. The `has_one` on",
            "`employee_record` above ties this signer to the stored",
            "`employee_wallet` field. The explicit `require!` on",
            "`employee_wallet.key() == employee_record.employee_wallet` in the",
            "body is a belt-and-braces check against any Anchor behaviour change."
          ],
          "signer": true,
          "relations": [
            "employeeRecord"
          ]
        },
        {
          "name": "decryptionRequest",
          "docs": [
            "`request_salary_decryption`. `read_decrypted_verified` reads its",
            "raw data; the verification checks `bytes_written == total_len` (Req",
            "5.7) and `ciphertext_digest == pending_digest` (Req 5.6)."
          ]
        }
      ],
      "args": []
    },
    {
      "name": "setPayrollConfig",
      "discriminator": [
        190,
        107,
        176,
        32,
        114,
        155,
        156,
        30
      ],
      "accounts": [
        {
          "name": "authority",
          "writable": true,
          "signer": true,
          "relations": [
            "treasury"
          ]
        },
        {
          "name": "treasury",
          "docs": [
            "Treasury whose payroll this config belongs to. `has_one = authority`",
            "enforces Req 3.4 `Unauthorized` on caller mismatch."
          ]
        },
        {
          "name": "payrollConfig",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  97,
                  121,
                  114,
                  111,
                  108,
                  108,
                  95,
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              },
              {
                "kind": "account",
                "path": "treasury"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "bandMin",
          "type": {
            "array": [
              "pubkey",
              5
            ]
          }
        },
        {
          "name": "bandMax",
          "type": {
            "array": [
              "pubkey",
              5
            ]
          }
        },
        {
          "name": "performanceThreshold",
          "type": "pubkey"
        },
        {
          "name": "bonusMultiplierBps",
          "type": "u16"
        }
      ]
    },
    {
      "name": "submitClaim",
      "discriminator": [
        163,
        108,
        111,
        46,
        220,
        82,
        77,
        212
      ],
      "accounts": [
        {
          "name": "employeeWallet",
          "writable": true,
          "signer": true,
          "relations": [
            "employeeRecord"
          ]
        },
        {
          "name": "treasury",
          "relations": [
            "employeeRecord",
            "policy"
          ]
        },
        {
          "name": "employeeRecord"
        },
        {
          "name": "policy"
        },
        {
          "name": "claimRecord",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  108,
                  97,
                  105,
                  109
                ]
              },
              {
                "kind": "account",
                "path": "employeeWallet"
              },
              {
                "kind": "account",
                "path": "treasury"
              },
              {
                "kind": "arg",
                "path": "claimTimestamp"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        },
        {
          "name": "claimTimestamp",
          "type": "i64"
        }
      ]
    },
    {
      "name": "terminateEmployee",
      "discriminator": [
        152,
        222,
        156,
        103,
        227,
        160,
        152,
        174
      ],
      "accounts": [
        {
          "name": "authority",
          "signer": true,
          "relations": [
            "treasury"
          ]
        },
        {
          "name": "treasury",
          "writable": true,
          "relations": [
            "employeeRecord"
          ]
        },
        {
          "name": "employeeRecord",
          "writable": true
        }
      ],
      "args": []
    },
    {
      "name": "updateEmployee",
      "discriminator": [
        73,
        4,
        138,
        145,
        85,
        224,
        29,
        186
      ],
      "accounts": [
        {
          "name": "authority",
          "signer": true,
          "relations": [
            "treasury"
          ]
        },
        {
          "name": "treasury",
          "relations": [
            "employeeRecord"
          ]
        },
        {
          "name": "employeeRecord",
          "writable": true
        }
      ],
      "args": [
        {
          "name": "encryptedSalary",
          "type": {
            "option": "pubkey"
          }
        },
        {
          "name": "encryptedPerformance",
          "type": {
            "option": "pubkey"
          }
        },
        {
          "name": "chainPreference",
          "type": {
            "option": "u8"
          }
        },
        {
          "name": "isActive",
          "type": {
            "option": "bool"
          }
        }
      ]
    },
    {
      "name": "updateTreasury",
      "discriminator": [
        60,
        16,
        243,
        66,
        96,
        59,
        254,
        131
      ],
      "accounts": [
        {
          "name": "authority",
          "signer": true,
          "relations": [
            "treasury"
          ]
        },
        {
          "name": "treasury",
          "writable": true
        }
      ],
      "args": [
        {
          "name": "name",
          "type": {
            "option": "string"
          }
        },
        {
          "name": "payrollInterval",
          "type": {
            "option": "i64"
          }
        },
        {
          "name": "spendingLimitPerTx",
          "type": {
            "option": "u64"
          }
        },
        {
          "name": "requiredApprovers",
          "type": {
            "option": "u8"
          }
        },
        {
          "name": "isActive",
          "type": {
            "option": "bool"
          }
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "claimRecord",
      "discriminator": [
        57,
        229,
        0,
        9,
        65,
        62,
        96,
        7
      ]
    },
    {
      "name": "employeeRecord",
      "discriminator": [
        137,
        106,
        233,
        41,
        166,
        225,
        188,
        98
      ]
    },
    {
      "name": "payrollConfig",
      "discriminator": [
        126,
        142,
        7,
        211,
        33,
        33,
        103,
        211
      ]
    },
    {
      "name": "payrollExecution",
      "discriminator": [
        66,
        101,
        61,
        128,
        24,
        51,
        170,
        229
      ]
    },
    {
      "name": "policyAccount",
      "discriminator": [
        218,
        201,
        183,
        164,
        156,
        127,
        81,
        175
      ]
    },
    {
      "name": "transactionProposal",
      "discriminator": [
        39,
        205,
        202,
        42,
        47,
        200,
        144,
        95
      ]
    },
    {
      "name": "treasuryConfig",
      "discriminator": [
        124,
        54,
        212,
        227,
        213,
        189,
        168,
        41
      ]
    }
  ],
  "events": [
    {
      "name": "claimProcessed",
      "discriminator": [
        214,
        130,
        82,
        189,
        1,
        255,
        166,
        249
      ]
    },
    {
      "name": "claimSubmitted",
      "discriminator": [
        95,
        1,
        120,
        227,
        177,
        240,
        174,
        52
      ]
    },
    {
      "name": "decryptionRequested",
      "discriminator": [
        113,
        218,
        107,
        36,
        135,
        73,
        33,
        73
      ]
    },
    {
      "name": "employeeRegistered",
      "discriminator": [
        168,
        165,
        71,
        39,
        150,
        0,
        45,
        45
      ]
    },
    {
      "name": "employeeTerminated",
      "discriminator": [
        1,
        241,
        82,
        10,
        244,
        221,
        253,
        141
      ]
    },
    {
      "name": "fheComputationRequested",
      "discriminator": [
        143,
        29,
        113,
        241,
        9,
        9,
        245,
        38
      ]
    },
    {
      "name": "ikaSigningRequested",
      "discriminator": [
        126,
        138,
        145,
        19,
        82,
        59,
        75,
        208
      ]
    },
    {
      "name": "payrollExecutionCompleted",
      "discriminator": [
        130,
        148,
        46,
        20,
        29,
        115,
        32,
        129
      ]
    },
    {
      "name": "payrollExecutionStarted",
      "discriminator": [
        142,
        42,
        237,
        203,
        130,
        62,
        5,
        143
      ]
    },
    {
      "name": "salaryRevealed",
      "discriminator": [
        203,
        237,
        40,
        1,
        130,
        22,
        58,
        75
      ]
    },
    {
      "name": "treasuryInitialized",
      "discriminator": [
        199,
        73,
        174,
        205,
        59,
        145,
        55,
        179
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "unauthorized",
      "msg": "Caller is not authorized"
    },
    {
      "code": 6001,
      "name": "treasuryInactive",
      "msg": "Treasury is inactive"
    },
    {
      "code": 6002,
      "name": "employeeInactive",
      "msg": "Employee is inactive"
    },
    {
      "code": 6003,
      "name": "invalidRoleId",
      "msg": "Role id must be between 0 and 4"
    },
    {
      "code": 6004,
      "name": "invalidChainPreference",
      "msg": "Chain preference must be between 0 and 2"
    },
    {
      "code": 6005,
      "name": "payrollIntervalNotElapsed",
      "msg": "Payroll interval has not elapsed"
    },
    {
      "code": 6006,
      "name": "fheExecutionFailed",
      "msg": "FHE execution failed"
    },
    {
      "code": 6007,
      "name": "decryptionNotComplete",
      "msg": "Decryption request is not complete or digest mismatch"
    },
    {
      "code": 6008,
      "name": "spendingLimitExceeded",
      "msg": "Spending limit exceeded"
    },
    {
      "code": 6009,
      "name": "insufficientApprovals",
      "msg": "Insufficient approvals"
    },
    {
      "code": 6010,
      "name": "timeLockNotElapsed",
      "msg": "Time lock has not elapsed"
    },
    {
      "code": 6011,
      "name": "policyInactive",
      "msg": "Policy is inactive"
    },
    {
      "code": 6012,
      "name": "claimExceedsVested",
      "msg": "Claim amount exceeds vested balance"
    },
    {
      "code": 6013,
      "name": "vestingCliffNotReached",
      "msg": "Vesting cliff not reached"
    },
    {
      "code": 6014,
      "name": "ikaSigningFailed",
      "msg": "Ika signing failed"
    },
    {
      "code": 6015,
      "name": "invalidApproverCount",
      "msg": "Invalid approver count"
    },
    {
      "code": 6016,
      "name": "nameTooLong",
      "msg": "Name exceeds maximum length"
    },
    {
      "code": 6017,
      "name": "invalidPayrollState",
      "msg": "Payroll execution is not in a finalizable state"
    }
  ],
  "types": [
    {
      "name": "claimProcessed",
      "docs": [
        "Emitted by `process_claim` once the Ika signature lands and the",
        "`ClaimRecord` transitions to `Executed` (Req 9.8). `ika_signature_hash`",
        "is the keccak256 digest of the signature bytes, not the signature itself,",
        "to keep the event payload bounded."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "claim",
            "type": "pubkey"
          },
          {
            "name": "status",
            "type": {
              "defined": {
                "name": "claimStatus"
              }
            }
          },
          {
            "name": "ikaSignatureHash",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          }
        ]
      }
    },
    {
      "name": "claimRecord",
      "docs": [
        "Per-claim record tracking the Ika signing lifecycle of an employee payout.",
        "",
        "Seeds: `[b\"claim\", employee.key().as_ref(), treasury.key().as_ref(), &claim_timestamp.to_le_bytes()]`.",
        "",
        "Created in `Pending` state by `submit_claim` (Req 9.1) and finalized by",
        "`process_claim` once the Ika MessageApproval reaches `Signed` (Req 9.7)."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "employee",
            "docs": [
              "Employee wallet that submitted the claim."
            ],
            "type": "pubkey"
          },
          {
            "name": "treasury",
            "docs": [
              "Parent treasury PDA."
            ],
            "type": "pubkey"
          },
          {
            "name": "claimTimestamp",
            "docs": [
              "Client-supplied timestamp used as a seed component for PDA uniqueness",
              "across multiple claims by the same employee (Req 9.1)."
            ],
            "type": "i64"
          },
          {
            "name": "amountClaimed",
            "docs": [
              "Amount being claimed (Req 9.2). Bounded by the employee's unclaimed",
              "vested amount — `ClaimExceedsVested` otherwise (Req 9.4)."
            ],
            "type": "u64"
          },
          {
            "name": "targetChain",
            "docs": [
              "Snapshotted from `EmployeeRecord.chain_preference` at submit time",
              "(Req 9.2)."
            ],
            "type": "u8"
          },
          {
            "name": "targetAddress",
            "docs": [
              "Snapshotted from `EmployeeRecord.target_address` at submit time",
              "(Req 9.2)."
            ],
            "type": {
              "array": [
                "u8",
                64
              ]
            }
          },
          {
            "name": "status",
            "docs": [
              "Current lifecycle state."
            ],
            "type": {
              "defined": {
                "name": "claimStatus"
              }
            }
          },
          {
            "name": "ikaMessageHash",
            "docs": [
              "Keccak256 digest of the cross-chain message submitted to Ika."
            ],
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "ikaSignature",
            "docs": [
              "Signature bytes returned by the Ika MPC network. Sized to 96 bytes",
              "to accommodate both ECDSA (r||s||v padded) and Ed25519 (64 bytes",
              "padded) encodings."
            ],
            "type": {
              "array": [
                "u8",
                96
              ]
            }
          },
          {
            "name": "bump",
            "docs": [
              "Stored PDA bump (design §3.1.1.1)."
            ],
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "claimStatus",
      "docs": [
        "Claim lifecycle discriminant."
      ],
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "pending"
          },
          {
            "name": "ikaApproved"
          },
          {
            "name": "executed"
          },
          {
            "name": "failed"
          }
        ]
      }
    },
    {
      "name": "claimSubmitted",
      "docs": [
        "Emitted by `submit_claim` when a new `ClaimRecord` PDA is opened in",
        "`Pending` (Req 9.3)."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "employee",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "targetChain",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "decryptionRequested",
      "docs": [
        "Emitted by `request_salary_decryption` immediately after the Encrypt CPI",
        "returns with a fresh digest snapshot (Req 5.2, design §3.1.1.10). Carries",
        "no ciphertext reference or digest so the event stream cannot be used to",
        "correlate multiple decryption requests for the same employee beyond the",
        "`employee` pubkey itself, which is already public treasury membership."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "employee",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "employeeRecord",
      "docs": [
        "Employee record PDA.",
        "",
        "Seeds: `[b\"employee\", treasury.key().as_ref(), employee_wallet.as_ref()]`.",
        "",
        "Encrypted compensation fields are stored as raw `[u8; 32]` ciphertext",
        "pubkey references (Req 2.2), not as `Pubkey`, so they can be passed",
        "verbatim to the Encrypt program without coercion."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "treasury",
            "docs": [
              "Parent treasury PDA (Req 2.1)."
            ],
            "type": "pubkey"
          },
          {
            "name": "employeeWallet",
            "docs": [
              "Employee's Solana wallet — must sign `request_salary_decryption`,",
              "`reveal_salary`, and `submit_claim` (Reqs 5.8, 9.1)."
            ],
            "type": "pubkey"
          },
          {
            "name": "roleId",
            "docs": [
              "Role tier 0..=4: Junior, Mid, Senior, Lead, Executive (Req 2.7)."
            ],
            "type": "u8"
          },
          {
            "name": "encryptedSalary",
            "docs": [
              "Ciphertext pubkey reference for the encrypted salary (Req 2.2)."
            ],
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "encryptedBonus",
            "docs": [
              "Ciphertext pubkey reference for the encrypted bonus (Req 2.2)."
            ],
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "encryptedPerformance",
            "docs": [
              "Ciphertext pubkey reference for the encrypted performance score",
              "(Req 2.2). Used as an input to `compute_bonus_amount` (Req 4.6)."
            ],
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "vestingStart",
            "docs": [
              "Unix timestamp when vesting starts (Req 2.3)."
            ],
            "type": "i64"
          },
          {
            "name": "vestingCliff",
            "docs": [
              "Cliff duration in seconds — no claim permitted before",
              "`vesting_start + vesting_cliff` (Req 9.5)."
            ],
            "type": "i64"
          },
          {
            "name": "vestingDuration",
            "docs": [
              "Total vesting duration in seconds (Req 4.7)."
            ],
            "type": "i64"
          },
          {
            "name": "totalAllocation",
            "docs": [
              "Plaintext total token allocation used as input to",
              "`compute_vested_amount` (Req 2.3)."
            ],
            "type": "u64"
          },
          {
            "name": "totalClaimed",
            "docs": [
              "Cumulative amount claimed; gated by `ClaimExceedsVested` (Req 9.4)."
            ],
            "type": "u64"
          },
          {
            "name": "chainPreference",
            "docs": [
              "Chain preference 0..=2: Solana, Ethereum, Bitcoin (Req 2.8)."
            ],
            "type": "u8"
          },
          {
            "name": "targetAddress",
            "docs": [
              "Payout destination on the target chain (Req 2.4)."
            ],
            "type": {
              "array": [
                "u8",
                64
              ]
            }
          },
          {
            "name": "pendingDigest",
            "docs": [
              "Snapshot digest of the last decryption request; zero = no request",
              "in flight (Reqs 5.2, 5.5, 5.7)."
            ],
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "isActive",
            "docs": [
              "`false` blocks decryption and claim flows (Reqs 5.9, 9.6)."
            ],
            "type": "bool"
          },
          {
            "name": "bump",
            "docs": [
              "Stored PDA bump (design §3.1.1.1)."
            ],
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "employeeRegistered",
      "docs": [
        "Emitted by `register_employee` once the `EmployeeRecord` PDA is written",
        "(Req 2.6). `role_id` is included so downstream audit log projections can",
        "surface the tier without reopening the account."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "treasury",
            "type": "pubkey"
          },
          {
            "name": "employee",
            "type": "pubkey"
          },
          {
            "name": "roleId",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "employeeTerminated",
      "docs": [
        "Emitted by `terminate_employee` when `is_active` flips to `false`",
        "(Req 2.10, design §3.1.1.5)."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "treasury",
            "type": "pubkey"
          },
          {
            "name": "employee",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "fheComputationRequested",
      "docs": [
        "Emitted alongside `PayrollExecutionStarted` to signal a new FHE graph",
        "invocation (Req 4.10). `graph` names the `#[encrypt_fn]` being executed",
        "(e.g. `\"compute_total_payout\"`) and `output_ct` is the destination",
        "ciphertext pubkey the off-chain executor must write."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "treasury",
            "type": "pubkey"
          },
          {
            "name": "graph",
            "type": "string"
          },
          {
            "name": "outputCt",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "ikaSigningRequested",
      "docs": [
        "Emitted by `approve_payroll_message` and `process_claim` once the raw Ika",
        "CPI returns successfully (Reqs 7.4, 9.3 via design §3.1.4). `message_hash`",
        "is the keccak256 digest the MPC network will sign; `target_chain` uses the",
        "same `0..=2` encoding as `EmployeeRecord.chain_preference`."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "treasury",
            "type": "pubkey"
          },
          {
            "name": "messageHash",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "targetChain",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "payrollConfig",
      "docs": [
        "Payroll configuration PDA storing salary band references and bonus params.",
        "",
        "Seeds: `[b\"payroll_config\", treasury.key().as_ref()]`.",
        "",
        "The five `(min, max)` pairs correspond to the five role tiers from",
        "`EmployeeRecord.role_id` (Req 3.2). `bonus_multiplier_bps` is stored as",
        "plaintext `u16` (basis points) and lifted into the FHE graph via `PUint64`",
        "by `compute_bonus_amount` (design §3.1.3) — no client-side encryption of",
        "the multiplier is required."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "treasury",
            "docs": [
              "Parent treasury PDA (Req 3.1)."
            ],
            "type": "pubkey"
          },
          {
            "name": "bandMin",
            "docs": [
              "Minimum salary ciphertext references, indexed by role tier (Req 3.2)."
            ],
            "type": {
              "array": [
                {
                  "array": [
                    "u8",
                    32
                  ]
                },
                5
              ]
            }
          },
          {
            "name": "bandMax",
            "docs": [
              "Maximum salary ciphertext references, indexed by role tier (Req 3.2)."
            ],
            "type": {
              "array": [
                {
                  "array": [
                    "u8",
                    32
                  ]
                },
                5
              ]
            }
          },
          {
            "name": "performanceThreshold",
            "docs": [
              "Ciphertext reference for the performance threshold used by the bonus",
              "gate (Req 3.3)."
            ],
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "bonusMultiplierBps",
            "docs": [
              "Bonus multiplier in basis points (Req 3.3). Max practical value 10_000",
              "(= 100%)."
            ],
            "type": "u16"
          },
          {
            "name": "bump",
            "docs": [
              "Stored PDA bump (design §3.1.1.1)."
            ],
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "payrollExecution",
      "docs": [
        "Lifecycle record for a single payroll run.",
        "",
        "Seeds: `[b\"payroll_exec\", treasury.key().as_ref(), &execution_id.to_le_bytes()]`.",
        "",
        "Opened in `Processing` state by `execute_payroll_computation` (Req 4.3)",
        "and transitioned to `Completed` by `finalize_payroll` once the output",
        "ciphertext commit is observed (Req 4.9). `Failed` is set on FHE error",
        "(Req 4.11) or by the admin timeout escape hatch."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "treasury",
            "docs": [
              "Parent treasury PDA."
            ],
            "type": "pubkey"
          },
          {
            "name": "executionId",
            "docs": [
              "Monotonic execution counter chosen by the authority."
            ],
            "type": "u64"
          },
          {
            "name": "status",
            "docs": [
              "Current lifecycle state."
            ],
            "type": {
              "defined": {
                "name": "payrollStatus"
              }
            }
          },
          {
            "name": "startedAt",
            "docs": [
              "Block timestamp when the CPI to `execute_graph` returned."
            ],
            "type": "i64"
          },
          {
            "name": "completedAt",
            "docs": [
              "Block timestamp when `finalize_payroll` ran (0 until then)."
            ],
            "type": "i64"
          },
          {
            "name": "employeesProcessed",
            "docs": [
              "Employees processed in this run (1 for the current per-employee",
              "execution model; see design §11 for batching roadmap)."
            ],
            "type": "u32"
          },
          {
            "name": "totalPayoutRef",
            "docs": [
              "Pubkey of the ciphertext account that receives the FHE output",
              "(`compute_total_payout`). Stored as raw bytes to match the",
              "ciphertext-ref convention used elsewhere."
            ],
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "ikaMessageHash",
            "docs": [
              "Keccak256 digest of the Ika-signed payload (Req 7.3). Zero until",
              "`approve_payroll_message` stamps it."
            ],
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "policyDigest",
            "docs": [
              "Digest returned by the `request_decryption` CPI for the encrypted",
              "`check_policy_compliance` boolean (Req 8.9, design §3.1.1.12)."
            ],
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "bump",
            "docs": [
              "Stored PDA bump (design §3.1.1.1)."
            ],
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "payrollExecutionCompleted",
      "docs": [
        "Emitted by `finalize_payroll` once the output ciphertext commit is",
        "observed and the run transitions to `Completed` (Req 4.10, design",
        "§3.1.1.8)."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "treasury",
            "type": "pubkey"
          },
          {
            "name": "executionId",
            "type": "u64"
          },
          {
            "name": "completedAt",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "payrollExecutionStarted",
      "docs": [
        "Emitted by `execute_payroll_computation` immediately after the Encrypt CPI",
        "returns, marking the asynchronous FHE run as `Processing` (Req 4.10).",
        "`started_at` anchors the interval gate per design §3.1.1.7."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "treasury",
            "type": "pubkey"
          },
          {
            "name": "executionId",
            "type": "u64"
          },
          {
            "name": "startedAt",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "payrollStatus",
      "docs": [
        "Payroll execution lifecycle discriminant.",
        "",
        "Values are contiguous starting at 0 so the Borsh wire encoding is a single",
        "byte and matches Anchor's native `ProgramError` convention."
      ],
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "pending"
          },
          {
            "name": "processing"
          },
          {
            "name": "completed"
          },
          {
            "name": "failed"
          }
        ]
      }
    },
    {
      "name": "policyAccount",
      "docs": [
        "Spending policy PDA enforced by `enforce_spending_policy` (Req 8.9) and",
        "consulted by `approve_transaction` (Reqs 8.4–8.8).",
        "",
        "Seeds: `[b\"policy\", treasury.key().as_ref(), &policy_id.to_le_bytes()]`.",
        "",
        "`required_approvers` is bound to `<= 5` and `<= non_zero_approver_count`",
        "at creation time (Req 8.1), else `InvalidApproverCount`."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "treasury",
            "docs": [
              "Parent treasury PDA."
            ],
            "type": "pubkey"
          },
          {
            "name": "policyId",
            "docs": [
              "Monotonic policy identifier chosen by the authority."
            ],
            "type": "u64"
          },
          {
            "name": "spendingLimit",
            "docs": [
              "Maximum transaction amount permitted by this policy (Req 8.2)."
            ],
            "type": "u64"
          },
          {
            "name": "timeLock",
            "docs": [
              "Seconds between `proposed_at` and the earliest legal execution time",
              "(Req 8.6). Zero disables the time lock."
            ],
            "type": "i64"
          },
          {
            "name": "requiredApprovers",
            "docs": [
              "Number of approver signatures required (Req 8.4)."
            ],
            "type": "u8"
          },
          {
            "name": "approvers",
            "docs": [
              "Fixed-size approver allowlist; unused slots are the zero Pubkey."
            ],
            "type": {
              "array": [
                "pubkey",
                5
              ]
            }
          },
          {
            "name": "isActive",
            "docs": [
              "`false` blocks `approve_transaction` (Req 8.8)."
            ],
            "type": "bool"
          },
          {
            "name": "bump",
            "docs": [
              "Stored PDA bump (design §3.1.1.1)."
            ],
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "salaryRevealed",
      "docs": [
        "Signal-only event emitted by `reveal_salary` to notify indexers that a",
        "plaintext salary was returned to the employee via `set_return_data`",
        "(design §3.1.1.10). Carries **no plaintext amount** — Req 5.4 restricts",
        "plaintext to the transaction return-data channel, which is visible only",
        "to the caller's transaction context."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "employee",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "transactionProposal",
      "docs": [
        "Persistent proposal state for the multi-sig approval flow.",
        "",
        "Seeds: `[b\"proposal\", treasury.key().as_ref(), &nonce.to_le_bytes()]`.",
        "",
        "`approve_transaction` operates on this PDA; the `proposed_at` anchor is",
        "what enables the time-lock check in Req 8.6, which is why a dedicated PDA",
        "exists rather than passing the proposal by transient args."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "treasury",
            "docs": [
              "Parent treasury PDA."
            ],
            "type": "pubkey"
          },
          {
            "name": "policy",
            "docs": [
              "Policy that governs this proposal's limits and approvers."
            ],
            "type": "pubkey"
          },
          {
            "name": "nonce",
            "docs": [
              "Monotonic proposal counter chosen by the proposer."
            ],
            "type": "u64"
          },
          {
            "name": "proposer",
            "docs": [
              "Wallet that submitted the proposal."
            ],
            "type": "pubkey"
          },
          {
            "name": "amount",
            "docs": [
              "Amount to be transferred on execution (Req 8.2 bound check)."
            ],
            "type": "u64"
          },
          {
            "name": "target",
            "docs": [
              "Destination wallet for the transfer."
            ],
            "type": "pubkey"
          },
          {
            "name": "proposedAt",
            "docs": [
              "Block timestamp at submit time — anchors the time-lock gate (Req 8.6)."
            ],
            "type": "i64"
          },
          {
            "name": "approversSigned",
            "docs": [
              "Positional acknowledgement from each approver in",
              "`PolicyAccount.approvers` (Req 8.4)."
            ],
            "type": {
              "array": [
                "bool",
                5
              ]
            }
          },
          {
            "name": "approvalCount",
            "docs": [
              "Cached popcount of `approvers_signed`; must reach `required_approvers`",
              "before execution (Req 8.5)."
            ],
            "type": "u8"
          },
          {
            "name": "executed",
            "docs": [
              "`true` once the proposal has been executed (single-shot guard)."
            ],
            "type": "bool"
          },
          {
            "name": "bump",
            "docs": [
              "Stored PDA bump (design §3.1.1.1)."
            ],
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "treasuryConfig",
      "docs": [
        "Treasury configuration PDA.",
        "",
        "Seeds: `[b\"treasury\", authority.key().as_ref()]`.",
        "",
        "Created by `initialize_treasury` (Req 1.1), mutated by `update_treasury`",
        "(Req 1.5) and `create_dwallet` (Req 6.1). `dwallet_curve_type` is stored",
        "as a `u8` following the Ika on-chain discriminant encoding documented at",
        "the bottom of this file (§3.1.2)."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "authority",
            "docs": [
              "Treasury administrator. Required signer for all admin instructions."
            ],
            "type": "pubkey"
          },
          {
            "name": "dwalletId",
            "docs": [
              "Pubkey of the dWallet account owned by the Ika program. Zeroed until",
              "`create_dwallet` binds it after the off-chain DKG ceremony (Req 6.1)."
            ],
            "type": "pubkey"
          },
          {
            "name": "dwalletCurveType",
            "docs": [
              "Curve discriminant for the bound dWallet (see `DWalletCurveType`",
              "encoding block at the bottom of this file)."
            ],
            "type": "u8"
          },
          {
            "name": "name",
            "docs": [
              "Human-readable treasury name, capped at 64 bytes (Req 1.1)."
            ],
            "type": "string"
          },
          {
            "name": "payrollInterval",
            "docs": [
              "Minimum seconds between successive payroll runs (Req 4.1)."
            ],
            "type": "i64"
          },
          {
            "name": "spendingLimitPerTx",
            "docs": [
              "Per-transaction spending ceiling enforced by `enforce_spending_policy`",
              "(Req 8.9)."
            ],
            "type": "u64"
          },
          {
            "name": "requiredApprovers",
            "docs": [
              "Number of approvers required for a transaction proposal (Req 8.4,",
              "bounded to <= 5 by `InvalidApproverCount`)."
            ],
            "type": "u8"
          },
          {
            "name": "totalEmployees",
            "docs": [
              "Count of active employees. Incremented by `register_employee` (Req",
              "2.5) and decremented by `terminate_employee` (Req 2.10)."
            ],
            "type": "u32"
          },
          {
            "name": "lastPayrollTimestamp",
            "docs": [
              "Start-time anchor of the most recent payroll run (Req 4.1 / 4.9)."
            ],
            "type": "i64"
          },
          {
            "name": "isActive",
            "docs": [
              "`false` blocks all instructions except `update_treasury` (Req 1.6)."
            ],
            "type": "bool"
          },
          {
            "name": "bump",
            "docs": [
              "Stored PDA bump (design §3.1.1.1 — must be assigned in init body)."
            ],
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "treasuryInitialized",
      "docs": [
        "Emitted by `initialize_treasury` once the `TreasuryConfig` PDA is written",
        "(Req 1.3)."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "treasury",
            "type": "pubkey"
          },
          {
            "name": "authority",
            "type": "pubkey"
          }
        ]
      }
    }
  ]
};
