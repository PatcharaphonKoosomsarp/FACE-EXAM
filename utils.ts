import { UserRole } from './types';

export const determineUserRole = (email: string): UserRole => {
  if (email.endsWith('@itm.kmutnb.ac.th') || email === 'okkubyes@gmail.com') {
    return UserRole.TEACHER;
  } else if (email.endsWith('@email.kmutnb.ac.th')) {
    return UserRole.STUDENT;
  }
  return UserRole.GUEST;
};
