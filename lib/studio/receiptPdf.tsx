import { Document, Page, Text, View, StyleSheet, renderToBuffer } from '@react-pdf/renderer'
import { formatTxnLabel } from '@/lib/studio/receiptLabel'
import type { StudioTransaction } from '@/types/studio'

const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 11, fontFamily: 'Helvetica', color: '#1A1A1A' },
  brand: { fontSize: 20, fontWeight: 700, marginBottom: 2 },
  subBrand: { fontSize: 10, color: '#666', marginBottom: 28 },
  title: { fontSize: 16, fontWeight: 700, marginBottom: 20 },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#EEE' },
  label: { color: '#666' },
  value: { fontWeight: 700 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingTop: 16, marginTop: 8 },
  totalLabel: { fontSize: 13, fontWeight: 700 },
  totalValue: { fontSize: 13, fontWeight: 700 },
  footer: { marginTop: 40, fontSize: 9, color: '#999' },
})

function formatRupees(paise: number): string {
  return `Rs. ${(paise / 100).toLocaleString('en-IN')}`
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('en-IN', {
    day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata',
  })
}

interface Props {
  studioName: string
  txn: StudioTransaction
}

function ReceiptDocument({ studioName, txn }: Props) {
  const baseAmount = Math.round(txn.amountPaise / 1.18)   // reverse out 18% GST for display
  const gstAmount  = txn.amountPaise - baseAmount
  const packageLabel = formatTxnLabel(txn)

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.brand}>VayuStudios</Text>
        <Text style={styles.subBrand}>Payment Receipt</Text>

        <Text style={styles.title}>Receipt for {studioName}</Text>

        <View style={styles.row}>
          <Text style={styles.label}>Receipt No.</Text>
          <Text style={styles.value}>{txn.txnId}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Date</Text>
          <Text style={styles.value}>{formatDate(txn.createdAt)}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Package</Text>
          <Text style={styles.value}>{packageLabel}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Amount (excl. GST)</Text>
          <Text style={styles.value}>{formatRupees(baseAmount)}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>GST (18%)</Text>
          <Text style={styles.value}>{formatRupees(gstAmount)}</Text>
        </View>
        {txn.razorpayPaymentId && (
          <View style={styles.row}>
            <Text style={styles.label}>Payment ID</Text>
            <Text style={styles.value}>{txn.razorpayPaymentId}</Text>
          </View>
        )}

        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Total Paid</Text>
          <Text style={styles.totalValue}>{formatRupees(txn.amountPaise)}</Text>
        </View>

        <Text style={styles.footer}>
          This is a computer-generated receipt for your VayuStudios purchase. For questions, contact support@vayutransfer.com.
        </Text>
      </Page>
    </Document>
  )
}

export async function renderReceiptPdf(studioName: string, txn: StudioTransaction): Promise<Buffer> {
  return renderToBuffer(<ReceiptDocument studioName={studioName} txn={txn} />)
}
