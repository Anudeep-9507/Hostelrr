export type Status = 'vacant' | 'occupied' | 'payment_due' | 'reserved';

export interface Bed {
  id: string;
  name: string;
  status: Status;
  residentId?: string;
}

export interface Room {
  id: string;
  number: string;
  beds: Bed[];
  baseRent?: number;
  layoutId?: string;
}

export interface Floor {
  id: string;
  level: number;
  name: string;
  rooms: Room[];
}

export interface Resident {
  id: string;
  name: string;
  phone: string;
  roomId: string;
  bedId: string;
  joinDate: string;
  paymentStatus: 'paid' | 'due' | 'partially_paid' | 'late';
  dueAmount: number;
  dueDate?: string;
  documentsComplete: boolean;
  photoUrl?: string;
  photoPath?: string;
  aadharDocumentPath?: string;
  aadharDocumentUrl?: string;
  hostelFormPath?: string;
  hostelFormUrl?: string;
  lastReminderSentAt?: string;
  emergencyPhone?: string;
  aadhar?: string;
  monthlyRent?: number;
  stayTime?: string | number;
  paymentHistory?: { id: string | number; date: string; amount: number; status: string; method?: 'UPI' | 'Cash'; title?: string }[];
  securityDeposit?: number;
  isDepositPaid?: boolean;
  depositPaidDate?: string;
  vacatingDate?: string;
  createdAt?: string;
  areaAndCity?: string;
  state?: string;
  country?: string;
  status?: 'active' | 'reserved' | 'left';
  confirmedAt?: string;
}

export interface PastResident {
  id: string;
  name: string;
  phone: string;
  roomId: string;
  bedId: string;
  joinDate: string;
  vacateDate: string;
  reason: string;
  photoUrl?: string;
  photoPath?: string;
  emergencyPhone?: string;
  aadhar?: string;
  paymentHistory?: { id: string | number; date: string; amount: number; status: string; method?: 'UPI' | 'Cash'; title?: string }[];
  createdAt?: string;
  areaAndCity?: string;
  state?: string;
  country?: string;
}

export interface JoinRequest {
  id: string;
  name: string;
  phone: string;
  occupation?: string;
  preferredRoom?: string;
  emergencyContact?: string;
  aadharNumber?: string;
  photoPath?: string;
  photoUrl?: string;
  aadharDocumentPath?: string;
  aadharDocumentUrl?: string;
  areaAndCity?: string;
  state?: string;
  country?: string;
  requestDate: string;
  status: 'pending' | 'approved' | 'rejected';
  stayDuration?: number | null;
}

export const MOckFloors: Floor[] = [
  {
    id: 'f3',
    level: 3,
    name: 'Floor 3',
    rooms: [
      {
        id: 'r301',
        number: '301',
        beds: [
          { id: 'b301a', name: 'Bed A', status: 'occupied', residentId: 'res1' },
          { id: 'b301b', name: 'Bed B', status: 'occupied', residentId: 'res2' },
          { id: 'b301c', name: 'Bed C', status: 'payment_due', residentId: 'res_hardcoded_1' },
        ]
      },
      {
        id: 'r302',
        number: '302',
        beds: [
          { id: 'b302a', name: 'Bed A', status: 'vacant' },
          { id: 'b302b', name: 'Bed B', status: 'vacant' },
        ]
      },
    ]
  },
  {
    id: 'f2',
    level: 2,
    name: 'Floor 2',
    rooms: [
      {
        id: 'r201',
        number: '201',
        beds: [
          { id: 'b201a', name: 'Bed A', status: 'occupied', residentId: 'res3' },
          { id: 'b201b', name: 'Bed B', status: 'payment_due', residentId: 'res4' },
          { id: 'b201c', name: 'Bed C', status: 'occupied', residentId: 'res5' },
        ]
      },
      {
        id: 'r202',
        number: '202',
        beds: [
          { id: 'b202a', name: 'Bed A', status: 'reserved', residentId: 'res_reserved_1' },
          { id: 'b202b', name: 'Bed B', status: 'reserved', residentId: 'res_reserved_2' },
          { id: 'b202c', name: 'Bed C', status: 'vacant' },
        ]
      },
    ]
  },
  {
    id: 'f1',
    level: 1,
    name: 'Floor 1',
    rooms: [
      {
        id: 'r101',
        number: '101',
        beds: [
          { id: 'b101a', name: 'Bed A', status: 'payment_due', residentId: 'res6' },
          { id: 'b101b', name: 'Bed B', status: 'occupied', residentId: 'res7' },
        ]
      },
      {
        id: 'r102',
        number: '102',
        beds: [
          { id: 'b102a', name: 'Bed A', status: 'occupied', residentId: 'res8' },
          { id: 'b102b', name: 'Bed B', status: 'payment_due', residentId: 'res_hardcoded_2' },
        ]
      },
    ]
  }
];

export const MockResidents: Resident[] = [
  { id: 'res_hardcoded_1', name: 'Sai Ram', phone: '88012 20744', roomId: 'r301', bedId: 'b301c', joinDate: '2026-04-20', paymentStatus: 'due', dueAmount: 5500, dueDate: '2026-04-25', documentsComplete: true, photoUrl: 'https://res.cloudinary.com/dfkfysygf/image/upload/v1777448441/sai_owner_natcmm.jpg' },
  { id: 'res_hardcoded_2', name: 'Naveen', phone: '81254 60218', roomId: 'r102', bedId: 'b102b', joinDate: '2026-04-22', paymentStatus: 'due', dueAmount: 6000, dueDate: '2026-04-26', documentsComplete: true, photoUrl: 'https://res.cloudinary.com/dfkfysygf/image/upload/v1777448759/naveen_owner_rwbozn.jpg' },
  { id: 'res_fake', name: 'fake', phone: '8076 091 804', roomId: 'r301', bedId: 'b301c', joinDate: '2026-04-20', paymentStatus: 'due', dueAmount: 5000, dueDate: '2026-04-25', documentsComplete: true },
  { id: 'res_reserved_1', name: 'Alia Bhatt', phone: '+91 98765 00001', roomId: 'r202', bedId: 'b202a', joinDate: '2026-05-01', paymentStatus: 'due', dueAmount: 5000, documentsComplete: false },
  { id: 'res_reserved_2', name: 'Ranbir Kapoor', phone: '+91 98765 00002', roomId: 'r202', bedId: 'b202b', joinDate: '2026-05-05', paymentStatus: 'due', dueAmount: 5000, documentsComplete: false },
  { id: 'res1', name: 'Ravi Kumar', phone: '+91 98765 43210', roomId: 'r301', bedId: 'b301a', joinDate: '2025-01-15', paymentStatus: 'paid', dueAmount: 0, documentsComplete: true },
  { id: 'res2', name: 'Amit Singh', phone: '+91 98765 43211', roomId: 'r301', bedId: 'b301b', joinDate: '2025-02-01', paymentStatus: 'due', dueAmount: 5500, dueDate: '2026-04-10', documentsComplete: true },
  { id: 'res3', name: 'Suresh Patel', phone: '+91 98765 43212', roomId: 'r201', bedId: 'b201a', joinDate: '2025-03-10', paymentStatus: 'due', dueAmount: 9000, dueDate: '2026-03-15', documentsComplete: false },
  { id: 'res4', name: 'Vikram Sharma', phone: '+91 98765 43213', roomId: 'r201', bedId: 'b201b', joinDate: '2025-04-01', paymentStatus: 'due', dueAmount: 6500, dueDate: '2026-04-05', documentsComplete: true },
  { id: 'res5', name: 'Neha Gupta', phone: '+91 98765 43214', roomId: 'r201', bedId: 'b201c', joinDate: '2025-11-20', paymentStatus: 'paid', dueAmount: 0, documentsComplete: true },
  { id: 'res6', name: 'Pooja Reddy', phone: '+91 98765 43215', roomId: 'r101', bedId: 'b101a', joinDate: '2026-02-12', paymentStatus: 'due', dueAmount: 8500, dueDate: '2026-03-25', documentsComplete: false },
  { id: 'res7', name: 'Arjun Das', phone: '+91 98765 43216', roomId: 'r101', bedId: 'b101b', joinDate: '2026-01-05', paymentStatus: 'due', dueAmount: 6000, dueDate: '2026-04-12', documentsComplete: true },
  { id: 'res8', name: 'Manoj Tiwari', phone: '+91 98765 43217', roomId: 'r102', bedId: 'b102a', joinDate: '2026-03-15', paymentStatus: 'paid', dueAmount: 0, documentsComplete: true },
  { id: 'res9', name: 'Karan Mehta', phone: '+91 98765 43218', roomId: 'r302', bedId: 'b302a', joinDate: '2026-01-10', paymentStatus: 'due', dueAmount: 8000, dueDate: '2026-03-30', documentsComplete: true },
];

export const MockPastResidents: PastResident[] = [
  { id: 'pres1', name: 'Rohit Verma', phone: '+91 98765 11111', roomId: 'r301', bedId: 'b301c', joinDate: '2024-06-01', vacateDate: '2026-04-20', reason: 'Job Relocation' },
  { id: 'pres2', name: 'Alok Nath', phone: '+91 98765 22222', roomId: 'r102', bedId: 'b102b', joinDate: '2025-01-15', vacateDate: '2026-04-10', reason: 'College Completed' },
  { id: 'pres3', name: 'Deepak Chahar', phone: '+91 98765 33333', roomId: 'r202', bedId: 'b202c', joinDate: '2025-08-10', vacateDate: '2026-03-25', reason: 'Transferred' },
];

export const MockActivities = [
  { id: 1, text: 'Ravi checked in', time: '2 hours ago', icon: 'UserPlus' },
  { id: 2, text: 'Payment received from Amit', time: '5 hours ago', icon: 'IndianRupee' },
  { id: 3, text: 'Room 203 vacated', time: '1 day ago', icon: 'LogOut' },
  { id: 4, text: 'Complaint resolved (Cleaning)', time: '2 days ago', icon: 'CheckCircle' },
];

export const MockJoinRequests: JoinRequest[] = [
  { id: 'jr1', name: 'Kabir Nayak', phone: '+91 98765 00001', occupation: 'Student', preferredRoom: '201', emergencyContact: '+91 98765 00011', aadharNumber: '1234 5678 9012', requestDate: '2 hours ago', status: 'pending' },
  { id: 'jr2', name: 'Aryan Mehta', phone: '+91 98765 00002', occupation: 'Employee', preferredRoom: '302', emergencyContact: '+91 98765 00022', aadharNumber: '9012 5678 1234', requestDate: '1 day ago', status: 'pending' },
];
