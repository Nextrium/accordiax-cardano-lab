use aiken/collection/list
use aiken/crypto.{VerificationKeyHash}
use cardano/transaction.{OutputReference, Transaction}

pub type EscrowDatum {
  buyer: VerificationKeyHash,
  seller: VerificationKeyHash,
}

pub type EscrowRedeemer {
  Release
  Refund
}

validator escrow {
  spend(
    datum: Option<EscrowDatum>,
    redeemer: EscrowRedeemer,
    _own_ref: OutputReference,
    self: Transaction,
  ) {
    expect Some(EscrowDatum { buyer, seller }) = datum

    when redeemer is {
      Release ->
        list.has(self.extra_signatories, seller)

      Refund ->
        list.has(self.extra_signatories, buyer)
    }
  }
}