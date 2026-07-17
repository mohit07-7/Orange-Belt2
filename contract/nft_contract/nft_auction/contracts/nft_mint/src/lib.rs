#![no_std]

use soroban_sdk::{
    contract, contracterror, contractevent, contractimpl, contracttype, Address, Env, String,
};

// ---------------------------------------------------------
// Error definitions
// ---------------------------------------------------------
#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum NFTError {
    NotAuthorized = 1,
    TokenNotFound = 2,
    TokenAlreadyExists = 3,
    NotInitialized = 4,
    AlreadyInitialized = 5,
}

// ---------------------------------------------------------
// Storage keys
// ---------------------------------------------------------
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum DataKey {
    Admin,
    NextTokenId,

    // NFT ownership data
    TokenOwner(i128),
    TokenUri(i128),

    // Approved operator for a token
    Approval(i128),
}

// ---------------------------------------------------------
// Events
// ---------------------------------------------------------
#[contractevent]
pub struct NFTMinted {
    pub token_id: i128,
    pub owner: Address,
    pub metadata_uri: String,
}

#[contractevent]
pub struct NFTTransferred {
    pub token_id: i128,
    pub from: Address,
    pub to: Address,
}

#[contractevent]
pub struct NFTBurned {
    pub token_id: i128,
    pub owner: Address,
}

#[contract]
pub struct NonFungibleToken;

#[contractimpl]
impl NonFungibleToken {
    // ---------------------------------------------------------
    // Initialize contract
    // ---------------------------------------------------------
    pub fn initialize(env: Env, admin: Address) -> Result<(), NFTError> {
        if env.storage().instance().has(&DataKey::Admin) {
            return Err(NFTError::AlreadyInitialized);
        }

        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::NextTokenId, &1i128);

        Ok(())
    }

    // ---------------------------------------------------------
    // Mint NFT
    // ---------------------------------------------------------
    pub fn mint(env: Env, to: Address, metadata_uri: String) -> Result<i128, NFTError> {
        // Receiver must authorize minting
        to.require_auth();

        let token_id: i128 = env
            .storage()
            .instance()
            .get(&DataKey::NextTokenId)
            .unwrap_or(1i128);

        env.storage()
            .persistent()
            .set(&DataKey::TokenOwner(token_id), &to);

        env.storage()
            .persistent()
            .set(&DataKey::TokenUri(token_id), &metadata_uri);

        // Increment token counter
        env.storage()
            .instance()
            .set(&DataKey::NextTokenId, &(token_id + 1));

        NFTMinted {
            token_id,
            owner: to.clone(),
            metadata_uri,
        }
        .publish(&env);

        Ok(token_id)
    }

    // ---------------------------------------------------------
    // Direct transfer
    // ---------------------------------------------------------
    pub fn transfer(
        env: Env,
        from: Address,
        to: Address,
        token_id: i128,
    ) -> Result<(), NFTError> {
        from.require_auth();

        let current_owner: Address = env
            .storage()
            .persistent()
            .get(&DataKey::TokenOwner(token_id))
            .ok_or(NFTError::TokenNotFound)?;

        if current_owner != from {
            return Err(NFTError::NotAuthorized);
        }

        env.storage()
            .persistent()
            .set(&DataKey::TokenOwner(token_id), &to);

        // Remove any previous approval after ownership changes
        env.storage()
            .persistent()
            .remove(&DataKey::Approval(token_id));

        NFTTransferred {
            token_id,
            from,
            to,
        }
        .publish(&env);

        Ok(())
    }

    // Returns owner of a token
    pub fn owner_of(env: Env, token_id: i128) -> Result<Address, NFTError> {
        env.storage()
            .persistent()
            .get(&DataKey::TokenOwner(token_id))
            .ok_or(NFTError::TokenNotFound)
    }

    // Returns metadata URI
    pub fn token_uri(env: Env, token_id: i128) -> Result<String, NFTError> {
        env.storage()
            .persistent()
            .get(&DataKey::TokenUri(token_id))
            .ok_or(NFTError::TokenNotFound)
    }

    // ---------------------------------------------------------
    // Approve another address to transfer an NFT
    // ---------------------------------------------------------
    pub fn approve(
        env: Env,
        owner: Address,
        spender: Address,
        token_id: i128,
    ) -> Result<(), NFTError> {
        owner.require_auth();

        let current_owner: Address = env
            .storage()
            .persistent()
            .get(&DataKey::TokenOwner(token_id))
            .ok_or(NFTError::TokenNotFound)?;

        if current_owner != owner {
            return Err(NFTError::NotAuthorized);
        }

        env.storage()
            .persistent()
            .set(&DataKey::Approval(token_id), &spender);

        Ok(())
    }

    // ---------------------------------------------------------
    // Transfer using approval
    // ---------------------------------------------------------
    pub fn transfer_from(
        env: Env,
        spender: Address,
        from: Address,
        to: Address,
        token_id: i128,
    ) -> Result<(), NFTError> {
        spender.require_auth();

        let approved: Address = env
            .storage()
            .persistent()
            .get(&DataKey::Approval(token_id))
            .ok_or(NFTError::NotAuthorized)?;

        if approved != spender {
            return Err(NFTError::NotAuthorized);
        }

        let current_owner: Address = env
            .storage()
            .persistent()
            .get(&DataKey::TokenOwner(token_id))
            .ok_or(NFTError::TokenNotFound)?;

        if current_owner != from {
            return Err(NFTError::NotAuthorized);
        }

        env.storage()
            .persistent()
            .set(&DataKey::TokenOwner(token_id), &to);

        // Clear approval after successful transfer
        env.storage()
            .persistent()
            .remove(&DataKey::Approval(token_id));

        NFTTransferred {
            token_id,
            from,
            to,
        }
        .publish(&env);

        Ok(())
    }

    // ---------------------------------------------------------
    // Burn NFT (Admin only)
    // ---------------------------------------------------------
    pub fn admin_burn(
        env: Env,
        admin: Address,
        token_id: i128,
    ) -> Result<(), NFTError> {
        admin.require_auth();

        let stored_admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .ok_or(NFTError::NotInitialized)?;

        if admin != stored_admin {
            return Err(NFTError::NotAuthorized);
        }

        let current_owner: Address = env
            .storage()
            .persistent()
            .get(&DataKey::TokenOwner(token_id))
            .ok_or(NFTError::TokenNotFound)?;

        // Remove all NFT-related storage
        env.storage().persistent().remove(&DataKey::TokenOwner(token_id));
        env.storage().persistent().remove(&DataKey::TokenUri(token_id));
        env.storage().persistent().remove(&DataKey::Approval(token_id));

        NFTBurned {
            token_id,
            owner: current_owner,
        }
        .publish(&env);

        Ok(())
    }

    // ---------------------------------------------------------
    // Owner burns their NFT
    // ---------------------------------------------------------
    pub fn burn(
        env: Env,
        from: Address,
        token_id: i128,
    ) -> Result<(), NFTError> {
        from.require_auth();

        let current_owner: Address = env
            .storage()
            .persistent()
            .get(&DataKey::TokenOwner(token_id))
            .ok_or(NFTError::TokenNotFound)?;

        if current_owner != from {
            return Err(NFTError::NotAuthorized);
        }

        env.storage().persistent().remove(&DataKey::TokenOwner(token_id));
        env.storage().persistent().remove(&DataKey::TokenUri(token_id));
        env.storage().persistent().remove(&DataKey::Approval(token_id));

        NFTBurned {
            token_id,
            owner: from,
        }
        .publish(&env);

        Ok(())
    }
}
