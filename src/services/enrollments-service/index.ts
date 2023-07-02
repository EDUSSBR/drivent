import { Address, Enrollment } from '@prisma/client';
import { request } from '@/utils/request';
import { notFoundError } from '@/errors';
import addressRepository, { CreateAddressParams } from '@/repositories/address-repository';
import enrollmentRepository, { CreateEnrollmentParams } from '@/repositories/enrollment-repository';
import { exclude } from '@/utils/prisma-utils';
import { ViaCEPAddress, ViaCEPNewAddress } from '@/protocols';
import { cepValidationSchema } from '@/schemas';

async function getAddressFromCEP({ cep }: Pick<Address, 'cep'>): Promise<ViaCEPNewAddress> {
  if (cep === undefined || cep.length < 8 || cep.length > 9) {
    throw notFoundError();
  }
  let newCep = cep;
  if (newCep.length === 8) {
    newCep = cep.slice(0, 5) + '-' + cep.slice(5);
  }
  const { error } = cepValidationSchema.validate(newCep);
  newCep = cep.replace('-', '');
  if (newCep.length !== 8 || error) {
    throw notFoundError();
  }

  const result = await request.get<{ data: ViaCEPAddress | { erro: 'true' } }>(
    `${process.env.VIA_CEP_API}/${newCep}/json/`,
  );
  const { erro } = result.data as { erro: 'true' };
  if (!result.data || Boolean(erro)) {
    throw notFoundError();
  }
  const { logradouro, complemento, bairro, localidade, uf } = result.data as ViaCEPAddress;
  return {
    logradouro,
    complemento,
    bairro,
    cidade: localidade,
    uf,
  };
}

async function getOneWithAddressByUserId(userId: number): Promise<GetOneWithAddressByUserIdResult> {
  const enrollmentWithAddress = await enrollmentRepository.findWithAddressByUserId(userId);

  if (!enrollmentWithAddress) throw notFoundError();

  const [firstAddress] = enrollmentWithAddress.Address;
  const address = getFirstAddress(firstAddress);

  return {
    ...exclude(enrollmentWithAddress, 'userId', 'createdAt', 'updatedAt', 'Address'),
    ...(!!address && { address }),
  };
}

type GetOneWithAddressByUserIdResult = Omit<Enrollment, 'userId' | 'createdAt' | 'updatedAt'>;

function getFirstAddress(firstAddress: Address): GetAddressResult {
  if (!firstAddress) return null;

  return exclude(firstAddress, 'createdAt', 'updatedAt', 'enrollmentId');
}

type GetAddressResult = Omit<Address, 'createdAt' | 'updatedAt' | 'enrollmentId'>;

async function createOrUpdateEnrollmentWithAddress(params: CreateOrUpdateEnrollmentWithAddress) {
  const enrollment = exclude(params, 'address');
  const address = getAddressForUpsert(params.address);
  await getAddressFromCEP({ cep: address.cep });

  const newEnrollment = await enrollmentRepository.upsert(params.userId, enrollment, exclude(enrollment, 'userId'));

  await addressRepository.upsert(newEnrollment.id, address, address);
}

function getAddressForUpsert(address: CreateAddressParams) {
  return {
    ...address,
    ...(address?.addressDetail && { addressDetail: address.addressDetail }),
  };
}

export type CreateOrUpdateEnrollmentWithAddress = CreateEnrollmentParams & {
  address: CreateAddressParams;
};

const enrollmentsService = {
  getOneWithAddressByUserId,
  createOrUpdateEnrollmentWithAddress,
  getAddressFromCEP,
};

export default enrollmentsService;
