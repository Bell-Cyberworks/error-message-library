'use client';

import { useActionState } from 'react';
import { updateErrorContentAction } from '@/actions/errorCodes';
import type { ActionResult } from '@/lib/actions/result';

const initialState: ActionResult | null = null;

interface EditableContent {
  id: string;
  header: string;
  description: string;
  friendlyMessage: string;
  category: string;
  errorCategory: string;
  httpCode: number;
  alertString: string;
  redirectUrl: string | null;
  eventId: string | null;
  eventCategory: string | null;
  transIdDisplay: boolean;
  retryEnabled: boolean;
  errorCodeDisplay: boolean;
}

// US-4.1/4.3 — Edit a code's per-(language, environment) content. NonProd only — the code
// detail page never renders this for a production row (a read-only display renders instead;
// see src/app/(admin)/applications/[applicationId]/codes/[codeId]/page.tsx). Field set/types
// match ErrorContent in prisma/schema.prisma exactly, per docs/error-code-schema.md.
export function EditErrorContentForm({ content }: { content: EditableContent }) {
  const [state, formAction, isPending] = useActionState(updateErrorContentAction, initialState);
  const fieldId = (name: string) => `${name}-${content.id}`;

  return (
    <form action={formAction}>
      <input type="hidden" name="errorContentId" value={content.id} />

      <div>
        <label htmlFor={fieldId('header')}>Header</label>
        <br />
        <input
          id={fieldId('header')}
          name="header"
          type="text"
          required
          maxLength={500}
          defaultValue={content.header}
        />
      </div>

      <div>
        <label htmlFor={fieldId('description')}>Description</label>
        <br />
        <textarea
          id={fieldId('description')}
          name="description"
          required
          maxLength={5000}
          defaultValue={content.description}
        />
      </div>

      <div>
        <label htmlFor={fieldId('friendlyMessage')}>Friendly message</label>
        <br />
        <textarea
          id={fieldId('friendlyMessage')}
          name="friendlyMessage"
          required
          maxLength={2000}
          defaultValue={content.friendlyMessage}
        />
      </div>

      <div>
        <label htmlFor={fieldId('category')}>Category</label>
        <br />
        <input
          id={fieldId('category')}
          name="category"
          type="text"
          required
          maxLength={200}
          defaultValue={content.category}
        />
      </div>

      <div>
        <label htmlFor={fieldId('errorCategory')}>Error category</label>
        <br />
        <input
          id={fieldId('errorCategory')}
          name="errorCategory"
          type="text"
          required
          maxLength={200}
          defaultValue={content.errorCategory}
        />
      </div>

      <div>
        <label htmlFor={fieldId('httpCode')}>HTTP code</label>
        <br />
        <input
          id={fieldId('httpCode')}
          name="httpCode"
          type="number"
          required
          min={0}
          max={599}
          defaultValue={content.httpCode}
        />
      </div>

      <div>
        <label htmlFor={fieldId('alertString')}>Alert string</label>
        <br />
        <input
          id={fieldId('alertString')}
          name="alertString"
          type="text"
          required
          maxLength={200}
          defaultValue={content.alertString}
        />
      </div>

      <div>
        <label htmlFor={fieldId('redirectUrl')}>Redirect URL</label>
        <br />
        <input
          id={fieldId('redirectUrl')}
          name="redirectUrl"
          type="text"
          maxLength={2000}
          defaultValue={content.redirectUrl ?? ''}
        />
      </div>

      <div>
        <label htmlFor={fieldId('eventId')}>Event ID</label>
        <br />
        <input
          id={fieldId('eventId')}
          name="eventId"
          type="text"
          maxLength={200}
          defaultValue={content.eventId ?? ''}
        />
      </div>

      <div>
        <label htmlFor={fieldId('eventCategory')}>Event category</label>
        <br />
        <input
          id={fieldId('eventCategory')}
          name="eventCategory"
          type="text"
          maxLength={200}
          defaultValue={content.eventCategory ?? ''}
        />
      </div>

      <div>
        <label htmlFor={fieldId('transIdDisplay')}>
          <input
            id={fieldId('transIdDisplay')}
            name="transIdDisplay"
            type="checkbox"
            defaultChecked={content.transIdDisplay}
          />{' '}
          Show transaction ID
        </label>
      </div>

      <div>
        <label htmlFor={fieldId('retryEnabled')}>
          <input
            id={fieldId('retryEnabled')}
            name="retryEnabled"
            type="checkbox"
            defaultChecked={content.retryEnabled}
          />{' '}
          Offer retry
        </label>
      </div>

      <div>
        <label htmlFor={fieldId('errorCodeDisplay')}>
          <input
            id={fieldId('errorCodeDisplay')}
            name="errorCodeDisplay"
            type="checkbox"
            defaultChecked={content.errorCodeDisplay}
          />{' '}
          Show raw error code
        </label>
      </div>

      {state && !state.success ? (
        <p role="alert" aria-live="assertive">
          {state.error}
        </p>
      ) : null}
      {state?.success ? <p role="status">Saved.</p> : null}
      <button type="submit" disabled={isPending}>
        {isPending ? 'Saving…' : 'Save'}
      </button>
    </form>
  );
}
