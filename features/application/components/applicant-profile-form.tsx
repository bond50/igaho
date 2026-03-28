'use client';

import { type FormEvent, useActionState, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ArrowRight, CheckCircle2, LoaderCircle, ShieldAlert } from 'lucide-react';
import { useFormStatus } from 'react-dom';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { updateApplicantProfile } from '@/features/application/actions/profile';
import { kenyaLocations } from '@/features/application/lib/kenya-locations';
import { ageBrackets, educationLevels, genders, nextOfKinRelationships, salutations, yearsOfExperienceOptions } from '@/features/application/schemas/application';
import { cn } from '@/lib/utils';

type ProfileFormState = {
  error?: string;
  success?: string;
  fieldErrors?: Record<string, string[] | undefined>;
  step?: number;
  redirectTo?: string;
  values?: Record<string, unknown>;
};

type ApplicantProfileFormProps = {
  email: string;
  initialValues: Record<string, unknown>;
};

const initialState: ProfileFormState = {};
const selectClassName =
  'flex h-11 w-full rounded-xl border border-slate-300/90 bg-white px-4 py-2.5 text-sm outline-none transition-all hover:border-slate-400 focus:border-[var(--brand)]';
const referralOptions = ['Referral', 'Website', 'Social Media', 'Event', 'Friend / Colleague'];
const steps = [
  { label: 'Identity', description: 'Personal details' },
  { label: 'Contact', description: 'Location details' },
  { label: 'Next of kin', description: 'Emergency contact' },
  { label: 'Professional', description: 'Work details' },
  { label: 'Education', description: 'Study and licensing' },
  { label: 'Association', description: 'Interests and chapter' },
  { label: 'Referees', description: 'Reference contacts' },
] as const;

function hasValue(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === 'string' ? value.trim().length > 0 : value !== null;
}

function isStepReady(formData: FormData, step: number) {
  if (step === 0) {
    return ['salutation', 'gender', 'firstName', 'surname', 'ageBracket', 'idNumber'].every((field) => hasValue(formData, field));
  }

  if (step === 1) {
    return ['countyCode', 'subCountyCode', 'wardCode', 'phoneNumber'].every((field) => hasValue(formData, field));
  }

  if (step === 4) {
    const licensed = formData.get('isLicensed') === 'true';
    return !licensed || (hasValue(formData, 'regulatoryBody') && hasValue(formData, 'yearOfRegistration'));
  }

  return true;
}

function getValidationFieldsForStep(step: number) {
  if (step === 0) return ['salutation', 'gender', 'firstName', 'surname', 'ageBracket', 'idNumber'];
  if (step === 1) return ['countyCode', 'subCountyCode', 'wardCode', 'phoneNumber'];
  if (step === 4) return ['regulatoryBody', 'yearOfRegistration'];
  if (step === 6) return ['refereeOneEmail', 'refereeTwoEmail'];
  return [];
}

function StepSubmitButton({ label, nextStepIndex, currentStepIndex, disabled, onAdvance }: { label: string; nextStepIndex: number; currentStepIndex: number; disabled: boolean; onAdvance?: () => void }) {
  const { pending } = useFormStatus();

  return (
    <Button
      type="submit"
      size="lg"
      className="rounded-xl"
      disabled={pending || disabled}
      onClick={() => {
        const nextInput = document.getElementById('profile-next-step-index') as HTMLInputElement | null;
        const currentInput = document.getElementById('profile-current-step-index') as HTMLInputElement | null;
        if (nextInput) nextInput.value = String(nextStepIndex);
        if (currentInput) currentInput.value = String(currentStepIndex);
        if (nextStepIndex > currentStepIndex) onAdvance?.();
      }}
    >
      {pending ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : <ArrowRight className="mr-2 h-4 w-4" />}
      {label}
    </Button>
  );
}

function getInitialString(values: Record<string, unknown>, key: string) {
  return typeof values[key] === 'string' ? String(values[key]) : '';
}

function getCurrentValues(initialValues: Record<string, unknown>, stateValues?: Record<string, unknown>) {
  return { ...initialValues, ...(stateValues ?? {}) };
}

function getInitialBoolean(values: Record<string, unknown>, key: string) {
  return values[key] === true;
}

function getInitialNumber(values: Record<string, unknown>, key: string, fallback = 0) {
  return typeof values[key] === 'number' && Number.isFinite(values[key]) ? Number(values[key]) : fallback;
}

function getInitialStringList(values: Record<string, unknown>, key: string) {
  const value = values[key];
  if (!Array.isArray(value)) return '';
  return value.filter((item): item is string => typeof item === 'string').join('\n');
}

function ErrorText({ errors }: { errors?: string[] }) {
  if (!errors?.length) return null;
  return <FieldError>{errors[0]}</FieldError>;
}

export function ApplicantProfileForm({ email, initialValues }: ApplicantProfileFormProps) {
  const router = useRouter();
  const initialStep = Math.max(0, Math.min(steps.length - 1, getInitialNumber(initialValues, 'profileCurrentStep', 0)));
  const [state, action] = useActionState<ProfileFormState, FormData>(updateApplicantProfile, initialState);
  const [step, setStep] = useState(initialStep);
  const [furthestUnlockedStep, setFurthestUnlockedStep] = useState(initialStep);
  const currentValues = getCurrentValues(initialValues, state.values);
  const formStateKey = JSON.stringify({ step, values: currentValues });
  const [countyCode, setCountyCode] = useState(getInitialString(currentValues, 'countyCode'));
  const [subCountyCode, setSubCountyCode] = useState(getInitialString(currentValues, 'subCountyCode'));
  const [wardCode, setWardCode] = useState(getInitialString(currentValues, 'wardCode'));
  const [currentStepReady, setCurrentStepReady] = useState(false);
  const [serverFieldErrors, setServerFieldErrors] = useState<Record<string, string[] | undefined>>({});
  const formRef = useRef<HTMLFormElement | null>(null);
  const focusNextStepRef = useRef(false);
  const lastStep = steps.length - 1;

  const county = kenyaLocations.find((item) => item.code === countyCode);
  const subCounties = county?.subCounties ?? [];
  const subCounty = subCounties.find((item) => item.code === subCountyCode);
  const wards = subCounty?.wards ?? [];
  const ward = wards.find((item) => item.code === wardCode);
  const displayFieldErrors = serverFieldErrors;

  function refreshStepReady() {
    if (!formRef.current) return;
    setCurrentStepReady(isStepReady(new FormData(formRef.current), step));
  }

  function handleFormInteraction(event: FormEvent<HTMLFormElement>) {
    refreshStepReady();
    const target = event.target as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null;
    const fieldName = target?.name;

    if (!fieldName) return;

    setServerFieldErrors((current) => {
      if (!current[fieldName]) return current;
      const next = { ...current };
      delete next[fieldName];
      return next;
    });
  }

  useEffect(() => {
    if (state.error) toast.error(state.error);
    if (state.success) toast.success(state.success);
    setServerFieldErrors(state.fieldErrors ?? {});
    if (typeof state.step === 'number') {
      const next = Math.max(0, Math.min(lastStep, state.step));
      setStep(next);
      setFurthestUnlockedStep((current) => Math.max(current, next));
    }
    if (state.redirectTo) {
      router.push(state.redirectTo);
    }
  }, [lastStep, router, state.error, state.fieldErrors, state.redirectTo, state.step, state.success]);

  useEffect(() => {
    setCountyCode(getInitialString(currentValues, 'countyCode'));
    setSubCountyCode(getInitialString(currentValues, 'subCountyCode'));
    setWardCode(getInitialString(currentValues, 'wardCode'));
  }, [state.values]);

  useEffect(() => {
    refreshStepReady();
  }, [step, countyCode, subCountyCode, wardCode]);

  useEffect(() => {
    if (!focusNextStepRef.current || !formRef.current) return;
    focusNextStepRef.current = false;
    const form = formRef.current;

    requestAnimationFrame(() => {
      form.scrollIntoView({ behavior: 'smooth', block: 'start' });
      const firstField = form.querySelector<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
        'input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled])',
      );
      firstField?.focus();
    });
  }, [step]);

  return (
    <form key={formStateKey} ref={formRef} action={action} className="space-y-6" onInputCapture={handleFormInteraction} onChangeCapture={handleFormInteraction}>
      <input id="profile-current-step-index" type="hidden" name="currentStepIndex" value={step} readOnly />
      <input id="profile-next-step-index" type="hidden" name="nextStepIndex" value={step} readOnly />
      <input type="hidden" name="county" value={county?.name ?? ''} />
      <input type="hidden" name="subCounty" value={subCounty?.name ?? ''} />
      <input type="hidden" name="ward" value={ward?.name ?? ''} />

      <section className="rounded-3xl border border-slate-200 bg-white p-5 sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm font-semibold text-slate-950">Profile setup</p>
            <p className="mt-1 text-sm text-slate-600">One section at a time. Save and continue to move forward.</p>
          </div>
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700">
            <CheckCircle2 className="h-4 w-4" />
            Step {step + 1} of {steps.length}
          </div>
        </div>
        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-7">
          {steps.map((item, index) => {
            const active = index === step;
            const saved = index < furthestUnlockedStep;
            const locked = index > furthestUnlockedStep;

            return (
              <button
                key={item.label}
                type="button"
                disabled={locked}
                onClick={() => setStep(index)}
                className={cn(
                  'rounded-2xl border px-4 py-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50',
                  active ? 'border-[var(--brand)] bg-[var(--brand-soft)] text-slate-950' : 'border-slate-200 bg-white text-slate-600',
                  !active && !locked ? 'hover:border-slate-300' : '',
                )}
              >
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em]">{saved ? 'Saved' : `Step ${index + 1}`}</p>
                <p className="mt-2 text-sm font-semibold">{item.label}</p>
                <p className="mt-1 text-xs text-slate-500">{item.description}</p>
              </button>
            );
          })}
        </div>
      </section>

      {step === 0 ? (
        <section className="grid gap-5 rounded-3xl border border-slate-200 bg-white p-6 sm:grid-cols-2">
          <div className="sm:col-span-2 space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--brand)]">Identity</p>
            <h3 className="text-xl font-semibold text-slate-950">Personal details</h3>
            <p className="text-sm leading-6 text-slate-600">Start with the details attached to your verified account.</p>
          </div>
          <Field>
            <FieldLabel htmlFor="email">Account email</FieldLabel>
            <Input id="email" value={email} readOnly disabled />
            <FieldDescription>This is fixed from your verified account and cannot be changed here.</FieldDescription>
          </Field>
          <Field className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
            <div className="flex items-start gap-3">
              <ShieldAlert className="mt-0.5 h-5 w-5 text-amber-700" />
              <div className="space-y-1 text-sm text-amber-900">
                <p className="font-semibold">Used across the portal</p>
                <p>Update it here once. Your application will reuse it.</p>
              </div>
            </div>
          </Field>
          <Field>
            <FieldLabel htmlFor="salutation" required>Salutation</FieldLabel>
            <select id="salutation" name="salutation" className={selectClassName} defaultValue={getInitialString(currentValues, 'salutation') || 'Mr'} required>
              <option value="">Select salutation</option>
              {salutations.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
            <ErrorText errors={displayFieldErrors.salutation} />
          </Field>
          <Field>
            <FieldLabel htmlFor="gender" required>Gender</FieldLabel>
            <select id="gender" name="gender" className={selectClassName} defaultValue={getInitialString(currentValues, 'gender') || 'Male'} required>
              <option value="">Select gender</option>
              {genders.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
            <ErrorText errors={displayFieldErrors.gender} />
          </Field>
          <Field>
            <FieldLabel htmlFor="firstName" required>First name</FieldLabel>
            <Input id="firstName" name="firstName" defaultValue={getInitialString(currentValues, 'firstName')} placeholder="First name" required />
            <ErrorText errors={displayFieldErrors.firstName} />
          </Field>
          <Field>
            <FieldLabel htmlFor="surname" required>Surname</FieldLabel>
            <Input id="surname" name="surname" defaultValue={getInitialString(currentValues, 'surname')} placeholder="Surname" required />
            <ErrorText errors={displayFieldErrors.surname} />
          </Field>
          <Field>
            <FieldLabel htmlFor="ageBracket" required>Age bracket</FieldLabel>
            <select id="ageBracket" name="ageBracket" className={selectClassName} defaultValue={getInitialString(currentValues, 'ageBracket')} required>
              <option value="">Select age bracket</option>
              {ageBrackets.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
            <ErrorText errors={displayFieldErrors.ageBracket} />
          </Field>
          <Field>
            <FieldLabel htmlFor="idNumber" required>ID number</FieldLabel>
            <Input id="idNumber" name="idNumber" defaultValue={getInitialString(currentValues, 'idNumber')} placeholder="National ID or passport number" required />
            <ErrorText errors={displayFieldErrors.idNumber} />
          </Field>
        </section>
      ) : null}

      {step === 1 ? (
        <section className="grid gap-5 rounded-3xl border border-slate-200 bg-white p-6 sm:grid-cols-2">
          <div className="sm:col-span-2 space-y-1">
            <h3 className="text-lg font-semibold text-slate-950">Location and contact</h3>
            <p className="text-sm leading-6 text-slate-600">Keep your current location and primary contact details up to date.</p>
          </div>
          <Field>
            <FieldLabel htmlFor="countyCode" required>County</FieldLabel>
            <select id="countyCode" name="countyCode" className={selectClassName} value={countyCode} onChange={(event) => { setCountyCode(event.target.value); setSubCountyCode(''); setWardCode(''); }} required>
              <option value="">Select county</option>
              {kenyaLocations.map((item) => <option key={item.code} value={item.code}>{item.name}</option>)}
            </select>
            <ErrorText errors={displayFieldErrors.countyCode} />
          </Field>
          {countyCode ? (
            <Field>
              <FieldLabel htmlFor="subCountyCode" required>Sub-county</FieldLabel>
              <select id="subCountyCode" name="subCountyCode" className={selectClassName} value={subCountyCode} onChange={(event) => { setSubCountyCode(event.target.value); setWardCode(''); }} required>
                <option value="">Select sub-county</option>
                {subCounties.map((item) => <option key={item.code} value={item.code}>{item.name}</option>)}
              </select>
              <ErrorText errors={displayFieldErrors.subCountyCode} />
            </Field>
          ) : null}
          {subCountyCode ? (
            <Field>
              <FieldLabel htmlFor="wardCode" required>Ward</FieldLabel>
              <select id="wardCode" name="wardCode" className={selectClassName} value={wardCode} onChange={(event) => setWardCode(event.target.value)} required>
                <option value="">Select ward</option>
                {wards.map((item) => <option key={item.code} value={item.code}>{item.name}</option>)}
              </select>
              <ErrorText errors={displayFieldErrors.wardCode} />
            </Field>
          ) : null}
          <Field className="sm:col-span-2">
            <FieldLabel htmlFor="residenceAddress">Residence address</FieldLabel>
            <Textarea id="residenceAddress" name="residenceAddress" defaultValue={getInitialString(currentValues, 'residenceAddress')} className="min-h-24" placeholder="Estate, road, house number, landmark, or postal address" />
          </Field>
          <Field>
            <FieldLabel htmlFor="phoneNumber" required>Phone number</FieldLabel>
            <Input id="phoneNumber" name="phoneNumber" defaultValue={getInitialString(currentValues, 'phoneNumber')} placeholder="07xx xxx xxx" required />
            <ErrorText errors={displayFieldErrors.phoneNumber} />
          </Field>
          <Field>
            <FieldLabel htmlFor="alternativePhoneNumber">Alternative phone</FieldLabel>
            <Input id="alternativePhoneNumber" name="alternativePhoneNumber" defaultValue={getInitialString(currentValues, 'alternativePhoneNumber')} placeholder="Optional second line" />
          </Field>
        </section>
      ) : null}

      {step === 2 ? (
        <section className="grid gap-5 rounded-3xl border border-slate-200 bg-white p-6 sm:grid-cols-2">
          <div className="sm:col-span-2 space-y-1">
            <h3 className="text-lg font-semibold text-slate-950">Next of kin</h3>
            <p className="text-sm leading-6 text-slate-600">Keep your emergency contact current.</p>
          </div>
          <Field>
            <FieldLabel htmlFor="nextOfKinFirstName">First name</FieldLabel>
            <Input id="nextOfKinFirstName" name="nextOfKinFirstName" defaultValue={getInitialString(currentValues, 'nextOfKinFirstName')} />
          </Field>
          <Field>
            <FieldLabel htmlFor="nextOfKinSurname">Surname</FieldLabel>
            <Input id="nextOfKinSurname" name="nextOfKinSurname" defaultValue={getInitialString(currentValues, 'nextOfKinSurname')} />
          </Field>
          <Field>
            <FieldLabel htmlFor="nextOfKinRelationship">Relationship</FieldLabel>
            <select id="nextOfKinRelationship" name="nextOfKinRelationship" className={selectClassName} defaultValue={getInitialString(currentValues, 'nextOfKinRelationship')}>
              <option value="">Select relationship</option>
              {nextOfKinRelationships.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </Field>
          <Field>
            <FieldLabel htmlFor="nextOfKinPhone">Phone number</FieldLabel>
            <Input id="nextOfKinPhone" name="nextOfKinPhone" defaultValue={getInitialString(currentValues, 'nextOfKinPhone')} />
          </Field>
        </section>
      ) : null}

      {step === 3 ? (
        <section className="grid gap-5 rounded-3xl border border-slate-200 bg-white p-6 sm:grid-cols-2">
          <div className="sm:col-span-2 space-y-1">
            <h3 className="text-lg font-semibold text-slate-950">Professional profile</h3>
            <p className="text-sm leading-6 text-slate-600">Use the professional details you want carried into future submissions.</p>
          </div>
          <Field>
            <FieldLabel htmlFor="profession">Profession</FieldLabel>
            <Input id="profession" name="profession" defaultValue={getInitialString(currentValues, 'profession')} placeholder="Clinical officer, counselor, trainer" />
          </Field>
          <Field>
            <FieldLabel htmlFor="currentJobTitle">Current job title</FieldLabel>
            <Input id="currentJobTitle" name="currentJobTitle" defaultValue={getInitialString(currentValues, 'currentJobTitle')} placeholder="Programme officer, medical officer" />
          </Field>
          <Field>
            <FieldLabel htmlFor="employerOrOrganizationName">Employer or organization</FieldLabel>
            <Input id="employerOrOrganizationName" name="employerOrOrganizationName" defaultValue={getInitialString(currentValues, 'employerOrOrganizationName')} placeholder="Current institution or employer" />
          </Field>
          <Field>
            <FieldLabel htmlFor="yearsOfExperience">Years of experience</FieldLabel>
            <select id="yearsOfExperience" name="yearsOfExperience" className={selectClassName} defaultValue={getInitialString(currentValues, 'yearsOfExperience')}>
              <option value="">Select experience band</option>
              {yearsOfExperienceOptions.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </Field>
          <Field className="sm:col-span-2">
            <FieldLabel htmlFor="workAddressOrLocation">Work address or location</FieldLabel>
            <Textarea id="workAddressOrLocation" name="workAddressOrLocation" defaultValue={getInitialString(currentValues, 'workAddressOrLocation')} className="min-h-24" placeholder="Facility, branch, street, town, or county" />
          </Field>
          <Field className="sm:col-span-2">
            <FieldLabel htmlFor="areasOfExpertise">Areas of expertise</FieldLabel>
            <Textarea id="areasOfExpertise" name="areasOfExpertise" defaultValue={getInitialStringList(currentValues, 'areasOfExpertise')} className="min-h-24" placeholder={'Enter one area per line, for example:\nCounseling\nTraining\nClinical practice'} />
            <FieldDescription>List the professional strengths you want reused in future submissions.</FieldDescription>
          </Field>
        </section>
      ) : null}

      {step === 4 ? (
        <section className="grid gap-5 rounded-3xl border border-slate-200 bg-white p-6 sm:grid-cols-2">
          <div className="sm:col-span-2 space-y-1">
            <h3 className="text-lg font-semibold text-slate-950">Education and licensing</h3>
            <p className="text-sm leading-6 text-slate-600">Keep qualifications and registration details current.</p>
          </div>
          <Field>
            <FieldLabel htmlFor="highestLevelOfEducation">Highest level of education</FieldLabel>
            <select id="highestLevelOfEducation" name="highestLevelOfEducation" className={selectClassName} defaultValue={getInitialString(currentValues, 'highestLevelOfEducation')}>
              <option value="">Select highest qualification</option>
              {educationLevels.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </Field>
          <Field>
            <FieldLabel htmlFor="yearOfGraduationForHighestDegree">Graduation year</FieldLabel>
            <Input id="yearOfGraduationForHighestDegree" name="yearOfGraduationForHighestDegree" defaultValue={getInitialString(currentValues, 'yearOfGraduationForHighestDegree')} placeholder="2021" />
          </Field>
          <Field className="sm:col-span-2">
            <FieldLabel htmlFor="institutionForHighestDegree">Institution</FieldLabel>
            <Input id="institutionForHighestDegree" name="institutionForHighestDegree" defaultValue={getInitialString(currentValues, 'institutionForHighestDegree')} placeholder="University or training institution" />
          </Field>
          <Field className="sm:col-span-2">
            <FieldLabel htmlFor="licensedYes">Are you licensed or registered?</FieldLabel>
            <div className="flex flex-col gap-3 text-sm text-slate-700 sm:flex-row">
              <label className="inline-flex items-center gap-2">
                <input id="licensedYes" type="radio" name="isLicensed" value="true" defaultChecked={getInitialBoolean(currentValues, 'isLicensed')} />
                Yes
              </label>
              <label className="inline-flex items-center gap-2">
                <input type="radio" name="isLicensed" value="false" defaultChecked={!getInitialBoolean(currentValues, 'isLicensed')} />
                No
              </label>
            </div>
          </Field>
          <Field>
            <FieldLabel htmlFor="regulatoryBody">Regulatory body</FieldLabel>
            <Input id="regulatoryBody" name="regulatoryBody" defaultValue={getInitialString(currentValues, 'regulatoryBody')} placeholder="Board or council name" />
            <ErrorText errors={displayFieldErrors.regulatoryBody} />
          </Field>
          <Field>
            <FieldLabel htmlFor="yearOfRegistration">Year of registration</FieldLabel>
            <Input id="yearOfRegistration" name="yearOfRegistration" defaultValue={getInitialString(currentValues, 'yearOfRegistration')} placeholder="2022" />
            <ErrorText errors={displayFieldErrors.yearOfRegistration} />
          </Field>
        </section>
      ) : null}

      {step === 5 ? (
        <section className="grid gap-5 rounded-3xl border border-slate-200 bg-white p-6 sm:grid-cols-2">
          <div className="sm:col-span-2 space-y-1">
            <h3 className="text-lg font-semibold text-slate-950">Association context</h3>
            <p className="text-sm leading-6 text-slate-600">These details stay with your profile. Membership category and payment stay in the application.</p>
          </div>
          <Field>
            <FieldLabel htmlFor="preferredChapterOrRegion">Preferred chapter or region</FieldLabel>
            <Input id="preferredChapterOrRegion" name="preferredChapterOrRegion" defaultValue={getInitialString(currentValues, 'preferredChapterOrRegion')} placeholder="Nairobi Chapter" />
          </Field>
          <Field>
            <FieldLabel htmlFor="referralSource">How did you hear about us?</FieldLabel>
            <select id="referralSource" name="referralSource" className={selectClassName} defaultValue={getInitialString(currentValues, 'referralSource')}>
              <option value="">Select source</option>
              {referralOptions.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </Field>
          <Field>
            <FieldLabel htmlFor="linkedInProfileUrl">LinkedIn or professional profile URL</FieldLabel>
            <Input id="linkedInProfileUrl" name="linkedInProfileUrl" type="url" defaultValue={getInitialString(currentValues, 'linkedInProfileUrl')} placeholder="https://www.linkedin.com/in/your-name" />
            <ErrorText errors={displayFieldErrors.linkedInProfileUrl} />
          </Field>
          <Field>
            <FieldLabel htmlFor="volunteerYes">Willing to volunteer?</FieldLabel>
            <div className="flex flex-col gap-3 text-sm text-slate-700 sm:flex-row">
              <label className="inline-flex items-center gap-2">
                <input id="volunteerYes" type="radio" name="willingnessToVolunteer" value="true" defaultChecked={getInitialBoolean(currentValues, 'willingnessToVolunteer')} />
                Yes
              </label>
              <label className="inline-flex items-center gap-2">
                <input type="radio" name="willingnessToVolunteer" value="false" defaultChecked={!getInitialBoolean(currentValues, 'willingnessToVolunteer')} />
                No
              </label>
            </div>
          </Field>
          <Field className="sm:col-span-2">
            <FieldLabel htmlFor="areasOfInterest">Areas of interest in association activities</FieldLabel>
            <Textarea id="areasOfInterest" name="areasOfInterest" defaultValue={getInitialStringList(currentValues, 'areasOfInterest')} className="min-h-24" placeholder={'Enter one area per line, for example:\nAdvocacy\nResearch\nMember engagement'} />
            <FieldDescription>These are your preferred association activity areas, not the membership category itself.</FieldDescription>
          </Field>
          <Field className="sm:col-span-2">
            <FieldLabel htmlFor="committeeInterest">Committee interest</FieldLabel>
            <Textarea id="committeeInterest" name="committeeInterest" defaultValue={getInitialString(currentValues, 'committeeInterest')} className="min-h-24" placeholder="Committees, working groups, or roles you would be open to supporting" />
          </Field>
        </section>
      ) : null}

      {step === 6 ? (
        <section className="grid gap-5 rounded-3xl border border-slate-200 bg-white p-6 sm:grid-cols-2">
          <div className="sm:col-span-2 space-y-1">
            <h3 className="text-lg font-semibold text-slate-950">Referees</h3>
            <p className="text-sm leading-6 text-slate-600">Keep referee contacts current for faster reviews and resubmissions.</p>
          </div>
          <Field>
            <FieldLabel htmlFor="refereeOneName">Referee 1 full name</FieldLabel>
            <Input id="refereeOneName" name="refereeOneName" defaultValue={getInitialString(currentValues, 'refereeOneName')} placeholder="Grace Wanjiru" />
          </Field>
          <Field>
            <FieldLabel htmlFor="refereeOnePhone">Referee 1 phone</FieldLabel>
            <Input id="refereeOnePhone" name="refereeOnePhone" defaultValue={getInitialString(currentValues, 'refereeOnePhone')} placeholder="07xx xxx xxx" />
          </Field>
          <Field>
            <FieldLabel htmlFor="refereeOneEmail">Referee 1 email</FieldLabel>
            <Input id="refereeOneEmail" name="refereeOneEmail" type="email" defaultValue={getInitialString(currentValues, 'refereeOneEmail')} placeholder="referee.one@example.com" />
            <ErrorText errors={displayFieldErrors.refereeOneEmail} />
          </Field>
          <Field>
            <FieldLabel htmlFor="refereeOneRelationship">Referee 1 relationship or role</FieldLabel>
            <Input id="refereeOneRelationship" name="refereeOneRelationship" defaultValue={getInitialString(currentValues, 'refereeOneRelationship')} placeholder="Supervisor, mentor, colleague" />
          </Field>
          <Field>
            <FieldLabel htmlFor="refereeTwoName">Referee 2 full name</FieldLabel>
            <Input id="refereeTwoName" name="refereeTwoName" defaultValue={getInitialString(currentValues, 'refereeTwoName')} placeholder="David Otieno" />
          </Field>
          <Field>
            <FieldLabel htmlFor="refereeTwoPhone">Referee 2 phone</FieldLabel>
            <Input id="refereeTwoPhone" name="refereeTwoPhone" defaultValue={getInitialString(currentValues, 'refereeTwoPhone')} placeholder="07xx xxx xxx" />
          </Field>
          <Field>
            <FieldLabel htmlFor="refereeTwoEmail">Referee 2 email</FieldLabel>
            <Input id="refereeTwoEmail" name="refereeTwoEmail" type="email" defaultValue={getInitialString(currentValues, 'refereeTwoEmail')} placeholder="referee.two@example.com" />
            <ErrorText errors={displayFieldErrors.refereeTwoEmail} />
          </Field>
          <Field>
            <FieldLabel htmlFor="refereeTwoRelationship">Referee 2 relationship or role</FieldLabel>
            <Input id="refereeTwoRelationship" name="refereeTwoRelationship" defaultValue={getInitialString(currentValues, 'refereeTwoRelationship')} placeholder="Peer, trainer, association member" />
          </Field>
        </section>
      ) : null}

      {state.error ? <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{state.error}</div> : null}
      {state.success ? <div className="rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-soft)] p-4 text-sm text-[var(--brand)]">{state.success}</div> : null}

      <div className="flex flex-col gap-3 rounded-3xl border border-slate-200 bg-white p-5 sm:flex-row sm:items-center sm:justify-between">
        <Button type="button" variant="outline" className="rounded-xl" onClick={() => setStep(Math.max(0, step - 1))} disabled={step === 0}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          {step < lastStep ? (
            <StepSubmitButton label="Save and continue" nextStepIndex={step + 1} currentStepIndex={step} disabled={!currentStepReady} onAdvance={() => { focusNextStepRef.current = true; }} />
          ) : (
            <StepSubmitButton label="Save and continue to application" nextStepIndex={step} currentStepIndex={step} disabled={!currentStepReady} />
          )}
        </div>
      </div>
    </form>
  );
}

