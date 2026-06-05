export const firstNames = [
  // Western
  'James', 'Mary', 'Christopher', 'Jennifer', 'Robert', 'Patricia', 'Michael', 'Linda',
  'William', 'Barbara', 'David', 'Elizabeth', 'Richard', 'Susan', 'Joseph', 'Karen',
  'Thomas', 'Sarah', 'Charles', 'Lisa', 'Daniel', 'Nancy', 'Matthew', 'Margaret',
  'Anthony', 'Betty', 'Mark', 'Sandra', 'Donald', 'Ashley',
  // East Asian
  'Wei', 'Ming', 'Jing', 'Fang', 'Lei', 'Ying', 'Hui', 'Xin',
  'Ji-ho', 'Soo-yeon', 'Min-jun', 'Yu-jin', 'Hana', 'Yuki', 'Kenji', 'Akiko',
  'Mei', 'Liang', 'Xiao', 'Rui',
  // South Asian
  'Priya', 'Anjali', 'Rahul', 'Arjun', 'Neha', 'Ananya', 'Vikram', 'Ravi',
  'Sunita', 'Kavya', 'Aditya', 'Divya', 'Rohan', 'Pooja', 'Amit', 'Sneha',
  'Sanjay', 'Meera', 'Nikhil', 'Rekha',
  // Middle Eastern
  'Omar', 'Fatima', 'Ahmed', 'Layla', 'Hassan', 'Nadia', 'Khalid', 'Yasmine',
  'Ibrahim', 'Amira', 'Ali', 'Sara', 'Kareem', 'Lina', 'Yusuf', 'Rania',
  // West African
  'Kwame', 'Amara', 'Kofi', 'Abena', 'Ama', 'Kwesi', 'Yaw', 'Akosua',
  'Chidi', 'Ngozi', 'Emeka', 'Adaeze', 'Kemi', 'Tunde', 'Bola', 'Chisom',
  // Eastern European
  'Aleksander', 'Natalia', 'Dmitri', 'Olga', 'Pavel', 'Katarzyna', 'Mikhail', 'Anastasia',
  'Bogdan', 'Zuzanna', 'Radek', 'Monika', 'Stefan', 'Agnieszka', 'Lukasz', 'Marta',
  // Latin American
  'Carlos', 'Sofia', 'Miguel', 'Valentina', 'Diego', 'Gabriela', 'Luis', 'Camila',
  'Andres', 'Isabella', 'Alejandro', 'Lucia', 'Javier', 'Maria', 'Pablo', 'Ana',
];

export const lastNames = [
  // Western
  'Smith', 'Johnson', 'Williams', 'Jones', 'Brown', 'Davis', 'Miller', 'Wilson',
  'Moore', 'Taylor', 'Anderson', 'Thomas', 'Jackson', 'White', 'Harris', 'Martin',
  'Thompson', 'Garcia', 'Martinez', 'Robinson', 'Clark', 'Rodriguez', 'Lewis', 'Lee',
  'Walker', 'Hall', 'Allen', 'Young', 'Hernandez', 'King',
  // East Asian
  'Nguyen', 'Tran', 'Le', 'Pham', 'Kim', 'Park', 'Choi', 'Jung',
  'Yamamoto', 'Tanaka', 'Watanabe', 'Ito', 'Chen', 'Wang', 'Liu', 'Zhang',
  'Li', 'Huang', 'Wu', 'Zhao',
  // South Asian
  'Patel', 'Singh', 'Sharma', 'Kumar', 'Gupta', 'Joshi', 'Desai', 'Shah',
  'Mehta', 'Nair', 'Rao', 'Reddy', 'Iyer', 'Pillai', 'Menon', 'Krishnan',
  'Verma', 'Mishra', 'Pandey', 'Shukla',
  // Middle Eastern
  'Al-Hassan', 'Al-Farsi', 'Al-Rashid', 'Khalil', 'Mansour', 'Aziz', 'Haddad', 'Nassar',
  'Saleh', 'Qureshi', 'Abbas', 'Karim', 'Farouk', 'Moussa', 'Nasser', 'Idris',
  // West African
  'Osei', 'Mensah', 'Asante', 'Owusu', 'Boateng', 'Amponsah', 'Adjei', 'Ansah',
  'Okafor', 'Adeyemi', 'Nwosu', 'Obi', 'Chukwu', 'Eze', 'Dike', 'Abiodun',
  // Eastern European
  'Kowalski', 'Nowak', 'Wiśniewski', 'Wójcik', 'Kowalczyk', 'Kamiński', 'Lewandowski',
  'Zieliński', 'Szymański', 'Woźniak', 'Ivanov', 'Petrov', 'Sidorov', 'Fedorov', 'Sokolov',
  'Volkov', 'Popov', 'Morozov', 'Novak', 'Procházka',
  // Latin American
  'Rivera', 'Morales', 'Reyes', 'Cruz', 'Flores', 'Gomez', 'Diaz', 'Torres',
  'Ramirez', 'Herrera', 'Medina', 'Vargas', 'Castillo', 'Romero', 'Ortiz', 'Gutierrez',
  'Chávez', 'Vásquez', 'Perez', 'Castro',
  // Walsh and extras
  'Walsh', 'Murphy', 'O\'Brien', 'Ryan', 'Sullivan', 'Burke', 'Carroll', 'Brennan',
];

export function generateUniqueName(usedNames: Set<string>): { firstName: string; lastName: string; fullName: string } {
  let firstName: string, lastName: string, fullName: string;
  let attempts = 0;
  do {
    firstName = firstNames[Math.floor(Math.random() * firstNames.length)];
    lastName = lastNames[Math.floor(Math.random() * lastNames.length)];
    fullName = `${firstName} ${lastName}`;
    attempts++;
    // After many attempts, append a number to guarantee uniqueness
    if (attempts > 200) {
      fullName = `${firstName} ${lastName} ${attempts}`;
      break;
    }
  } while (usedNames.has(fullName));
  usedNames.add(fullName);
  return { firstName, lastName, fullName };
}
