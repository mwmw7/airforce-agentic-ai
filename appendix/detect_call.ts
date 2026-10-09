// (공개본) 툰스퀘어 Deev 채팅 서비스 코드 발췌. Jev(TypeSafe) 탐지를 부르는 detectPromptInjection 만 남기고
// 나머지 서비스 내부 로직(요청 관리 · 접근 제어 · 메시지 준비)은 주석 처리했다.

// * AbortController 생성
// */
// private setAbortController(
//     requestId: string,
//     chatRoomId: number,
// ): AbortController {
//     const abortController = new AbortController();
//     const timeoutId = setTimeout(
//         () => {
//             if (!abortController.signal.aborted) {
//                 abortController.abort();
//             }
//             this.abortControllers.delete(requestId);
//         },
//         3 * 60 * 1000,
//     );

//     this.abortControllers.set(requestId, {
//         controller: abortController,
//         timeoutId,
//         chatRoomId,
//     });

//     return abortController;
// }

// /**
//  *
//  * @param {Data} data
//  * @returns {string}
//  */
// private getUserName(data: Data): string {
//     return data.user.persona ? data.user.persona.nickname! : data.user.name!;
// }

// /**
//  * 이미지 링크가 제거되어 최종 텍스트가 빈 문자열("")이 되는 경우, 방어 코드로 온점을 반환
//  * @param {string | null | undefined} text
//  * @param {string} userName
//  * @param {string} characterName
//  * @returns {string}
//  */
// private interpolateCharacterText(
//     text: string | null | undefined,
//     userName: string,
//     characterName: string,
// ): string {
//     if (!text) return '.';

//     return (
//         removeImageLinks(
//             text.replace(
//                 CHARACTER_VAR_REGEX,
//                 (_, key) =>
//                     (
//                         ({ user: userName, char: characterName }) as Record<
//                             string,
//                             string
//                         >
//                     )[key] ?? '',
//             ),
//         ) || '.'
//     );
// }

// /**
//  * 바로 직전의 (User -> Model) 메시지 쌍을 찾아 반환한다.
//  * @param {DvChatMessage[]} messages - 메시지 목록
//  * @returns {[DvChatMessage, DvChatMessage] | null} - [이전 유저 메시지, 이전 모델 메시지] 튜플
//  */
// private getPrevMessages(messages?: DvChatMessage[]): DvChatMessage[] | null {
//     if (!messages || messages.length === 0) return null;

//     // 직전 턴의 모델 메시지 찾기
//     let modelIdx = -1;
//     for (let i = messages.length - 1; i >= 0; i--) {
//         const m = messages[i];
//         if (m.role === ChatRole.Model) {
//             modelIdx = i;
//             break;
//         }
//     }
//     if (modelIdx < 0) return null;

//     // 모델 메시지 앞쪽에서 가장 가까운 유저 메시지 찾기
//     let userIdx = -1;
//     for (let i = modelIdx - 1; i >= 0; i--) {
//         const m = messages[i];
//         if (m.role === ChatRole.User) {
//             userIdx = i;
//             break;
//         }
//     }
//     if (userIdx < 0) return null;

//     const prevUser = messages[userIdx];
//     const prevModel = messages[modelIdx];

//     if (!prevUser?.content || !prevModel?.content) return null;
//     if (!prevModel?.id || !prevUser?.id) return null;

//     return [prevUser, prevModel];
// }

// /**
//  * 재생성 답변 방향 정규화. 비어 있으면 undefined (기존 재생성과 동일).
//  */
// private normalizeRegenerateDirection(direction?: string): string | undefined {
//     if (!direction) {
//         return undefined;
//     }

//     const normalized = direction.replace(/[<>]/g, '').trim();
//     if (!normalized) {
//         return undefined;
//     }

//     return normalized.slice(0, REGENERATE_DIRECTION_MAX_LENGTH);
// }

/**
 * 인젝션 및 유출 프롬프트를 탐지합니다.
 */
private async detectPromptInjection(
    content: string | undefined,
    persona: DvPersonas | null,
    userNote: any,
    direction?: string,
): Promise<
| { ok: true }
| {
    ok: false;
    errorCode: number | undefined;
    errorMessage: string | undefined;
}
> {
    const inputs = [
        { name: 'userPrompt', content: content || '' },
        { name: 'userPersona', content: persona?.info || '' },
        { name: 'userNote', content: userNote?.note || '' },
        { name: 'regenerateDirection', content: direction || '' },
    ];
    const safety = await this.detector.detect(inputs);

    if (safety.unavailableReason) {
    logger.error({
        slack: true,
        name: 'Prompt safety check unavailable',
        message: `[PromptSafety] unavailable; reason: ${safety.unavailableReason}`,
        channel: process.env.SLACK_ERROR_CHANNEL,
    });
}

if (safety.detected) {
    logger.error({
        name: 'Prompt injection detected',
        message: `[PromptSafety] blocked; detector: ${safety.detector}`,
    });

    return {
        ok: false,
        errorCode: ERROR_CODE.DvPromptInjectionDetected.code,
        errorMessage: ERROR_CODE.DvPromptInjectionDetected.message,
    };
}

return { ok: true };
}

// /**
//  * 채팅 접근 가능 여부를 검증합니다.
//  */
// private async validateChatAccess(params: {
//     character: DvCharacter;
//     chatMode: DvChatMode;
//     isAdultVerification: boolean;
//     user: User;
//     contentMode: ContentMode;
//     myPoints: UserPoint;
// }): Promise<
// | { ok: true }
// | {
//     ok: false;
//     errorCode: number | undefined;
//     errorMessage: string | undefined;
// }
// > {
//     const {
//         character,
//         chatMode,
//         isAdultVerification,
//         user,
//         contentMode,
//         myPoints,
//     } = params;

//     // 유저가 성인 컨텐츠에 접근 불가능한데 캐릭터가 성인 전용 컨텐츠인 경우.
//     // contentMode가 있으면(일본) DB의 isAdultVerification은 무시하고 R18 진입 여부로만 판단한다 - 일본 DMM 가입 유저는
//     // R18/Safe 어느 쪽으로 가입했든 가입 시점에 isAdultVerification이 무조건 true로 저장되어 있어 DB값을 신뢰할 수 없다.
//     const canAccessAdultContent = resolveShowMatureContent(
//         isAdultVerification,
//         contentMode,
//     );
//     if (!canAccessAdultContent && character.isAdultContent) {
//     return {
//         ok: false,
//         errorCode: ERROR_CODE.DvIsAccessCharacterAdultContent.code,
//         errorMessage: ERROR_CODE.DvIsAccessCharacterAdultContent.message,
//     };
// }

// const [isBlocked, checkResult] = await Promise.all([
//     this.userBlockRepository.isCharacterBlockedByUser(
//         user.id,
//         character.id,
//         character.userId,
//     ),
//     this.chatHelper.checkBasicIsAvailableChat({
//         user,
//         chatMode,
//         myPoints,
//     }),
// ]);

// if (isBlocked) {
//     return {
//         ok: false,
//         errorCode: ERROR_CODE.DvBlockedCharacter.code,
//         errorMessage: ERROR_CODE.DvBlockedCharacter.message,
//     };
// }

// if (!checkResult.result) {
//     return {
//         ok: false,
//         errorCode: checkResult.errorCode,
//         errorMessage: checkResult.errorMessage,
//     };
// }

// return { ok: true };
// }

// private async prepareMessageContext(params: {
//     dvChatRoom: DvChatRoom;
//     character: DvCharacter;
//     persona: DvPersonas | null;
//     user: User;
//     chatMode: DvChatMode;
//     options: {