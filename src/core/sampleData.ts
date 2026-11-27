/**
 * Clearly fictional sample evidence text containing all supported entity categories,
 * repeated entities, and realistic invalid edge cases (invalid IPv4 octets,
 * invalid Verhoeff Aadhaar checksum, invalid Luhn card number, arbitrary digits).
 */
export const SAMPLE_CASE_TEXT = `CASE FILE: FD-2026-0418 // INTAKE TRANSCRIPT (FICTIONAL TEST DATA)
Reported by: Meera Nair <meera.nair@example.invalid>
Secondary contact: support.desk@example.org (repeat: meera.nair@example.invalid)

Primary mobile: +91 98201-44320
Alternate phone: 091234 56789 | Landline-style mobile: +91-7045123890
Repeat primary mobile: +91 98201-44320

Workstation IPv4: 192.168.14.22
Gateway IPv4: 10.0.4.254
Invalid IPv4 candidate (should be rejected): 299.168.0.1 and 172.300.12.4

PAN on file: ABCDE1234F
Co-applicant PAN: PQRST5678L (repeat: ABCDE1234F)

Aadhaar-format (Verhoeff valid test): 4991 1866 5246
Aadhaar-format (Verhoeff INVALID, should be flagged/rejected): 4991 1866 5247
12-digit order reference (non-Aadhaar / invalid checksum): 123456789012

Card-format Visa test (Luhn valid): 4532 0151 1283 0366
Card-format Mastercard test (Luhn valid): 5425-2334-3010-9903
Card-format RuPay test (Luhn valid): 6074 8900 1234 5676
Card-format Amex test (Luhn valid): 3782 822463 10005
Invalid Luhn 16-digit string (must reject): 4532 0151 1283 0367
Arbitrary 16-digit serial number (must reject): 9000111122223333`;

export const SAMPLE_CSV_TEXT = `case_id,reporter_name,email,phone,pan,aadhaar_test,ip_address,notes
CASE-101,Aarav Kulkarni,aarav.k@example.invalid,+91 98111 22334,ABCDE1234F,4991-1866-5246,192.168.1.44,"Submitted via intake desk; repeat aarav.k@example.invalid"
CASE-102,Diya Menon,diya.menon@example.org,9876543210,LMNOP4321K,4991 1866 5246,10.24.8.19,"Card ref 4532-0151-1283-0366 checked"
CASE-103,Rohan Verma,rohan.v@example.net,+91-8123456789,ZXCVB9876M,4991 1866 5247,299.10.0.1,=SUM(A1:A2) formula test`;

