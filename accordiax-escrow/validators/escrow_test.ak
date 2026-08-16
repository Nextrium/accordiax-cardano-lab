use aiken/crypto.{VerificationKeyHash}
use cardano/transaction.{OutputReference, Transaction}

use escrow

const buyer: VerificationKeyHash =
  #"0000000000000000000000000000000000000000000000000000000000000000"

const seller: VerificationKeyHash =
  #"1111111111111111111111111111111111111111111111111111111111111111"

const escrow_datum =
  escrow.EscrowDatum {
    buyer,
    seller,
  }

const placeholder_utxo =
  OutputReference {
    transaction_id: transaction.placeholder.id,
    output_index: 0,
  }

test release_is_authorized_by_seller() {
  let tx =
    Transaction {
      ..transaction.placeholder,
      extra_signatories: [seller],
    }

  escrow.escrow.spend(
    Some(escrow_datum),
    escrow.Release,
    placeholder_utxo,
    tx,
  )
}

test release_is_rejected_without_seller() {
  let tx =
    Transaction {
      ..transaction.placeholder,
      extra_signatories: [buyer],
    }

  !escrow.escrow.spend(
    Some(escrow_datum),
    escrow.Release,
    placeholder_utxo,
    tx,
  )
}

test refund_is_authorized_by_buyer() {
  let tx =
    Transaction {
      ..transaction.placeholder,
      extra_signatories: [buyer],
    }

  escrow.escrow.spend(
    Some(escrow_datum),
    escrow.Refund,
    placeholder_utxo,
    tx,
  )
}

test refund_is_rejected_without_buyer() {
  let tx =
    Transaction {
      ..transaction.placeholder,
      extra_signatories: [seller],
    }

  !escrow.escrow.spend(
    Some(escrow_datum),
    escrow.Refund,
    placeholder_utxo,
    tx,
  )
}